#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { test } from 'node:test'

const exec = promisify(execFile)
const root = path.resolve(import.meta.dirname, '../..')
const cli = path.join(root, 'bin/bitnet-harness.mjs')

test('package metadata exposes bith and the transitional CLI alias', async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  assert.equal(packageJson.name, 'bitnet-agent-harness')
  assert.equal(packageJson.bin.bith, 'bin/bith.mjs')
  assert.equal(packageJson.bin['bitnet-harness'], 'bin/bitnet-harness.mjs')
  assert.equal(packageJson.repository.url, 'git+https://github.com/pulsaride/bitnet-agent-harness.git')
})

test('CLI exposes installed skills as structured JSON', async () => {
  const { stdout } = await exec(process.execPath, ['--experimental-strip-types', cli, '--json', 'skills', 'list', '--root', path.join(root, 'examples/skills')], { cwd: root })
  const result = JSON.parse(stdout)
  assert.equal(result.ok, true)
  assert.equal(result.data.some((skill) => skill.name === 'repository-analysis'), true)
})

test('CLI rejects unsupported commands with nonzero status and JSON error', async () => {
  await assert.rejects(() => exec(process.execPath, ['--experimental-strip-types', cli, '--json', 'unknown'], { cwd: root }), (error) => {
    assert.equal(error.code, 2)
    assert.equal(JSON.parse(error.stdout).ok, false)
    return true
  })
})

test('CLI consumes run options before constructing the model prompt', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'bitnet-agent-harness-cli-'))
  try {
    await exec(process.execPath, ['--experimental-strip-types', cli, 'run', '--workspace', workspace, '--skills', path.join(root, 'examples/skills'), '--endpoint', 'http://127.0.0.1:15842', '--json', 'Inspect', 'the', 'workspace'], { cwd: root }).catch(() => undefined)
    const sessionRoot = path.join(workspace, '.bitnet-agent-harness', 'sessions')
    const sessionFiles = await readdir(sessionRoot)
    assert.equal(sessionFiles.length, 1)
    const events = (await readFile(path.join(sessionRoot, sessionFiles[0]), 'utf8')).trim().split('\n').map(JSON.parse)
    const prompt = events.find((event) => event.type === 'run-started')?.payload.prompt
    assert.equal(prompt, 'Inspect the workspace')
    assert.equal(prompt.includes('--workspace'), false)
    assert.equal(prompt.includes('--skills'), false)
    assert.equal(prompt.includes('--endpoint'), false)
  } finally { await rm(workspace, { recursive: true, force: true }) }
})

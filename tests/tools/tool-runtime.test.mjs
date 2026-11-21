#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { TraceWriter } from '../../src/capabilities/trace.ts'
import { Workspace } from '../../src/policy/workspace.ts'
import { createFileTools } from '../../src/tools/file-tools.ts'
import { createGitTools } from '../../src/tools/git-tools.ts'
import { createTestTool, defineTestProfile } from '../../src/tools/test-tool.ts'

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'bitnet-tool-runtime-'))
  await writeFile(path.join(root, 'a.txt'), 'hello\n')
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('tracing, truncation, and file tools return valid JSON envelopes', async (t) => {
  const root = await fixture(t)
  const events = []
  const trace = new TraceWriter({ sink: async (event) => events.push(event), runId: 'run-1' })
  const tools = createFileTools(new Workspace(root), { maxReadBytes: 3, trace })
  const result = await tools.read.execute({ path: 'a.txt', offset: 0, limit: 20 })
  assert.equal(result.text.length, 3)
  assert.equal(result.truncated, true)
  assert.equal(events[0].type, 'tool-start')
  assert.equal(events.at(-1).type, 'tool-result')
})

test('git diff inventories tracked and untracked files', async (t) => {
  const root = await fixture(t)
  const { execFileSync } = await import('node:child_process')
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root })
  execFileSync('git', ['add', 'a.txt'], { cwd: root })
  execFileSync('git', ['commit', '-qm', 'initial'], { cwd: root })
  await writeFile(path.join(root, 'a.txt'), 'changed\n')
  await writeFile(path.join(root, 'new.txt'), 'new\n')
  const result = await createGitTools(new Workspace(root)).diff.execute({ staged: false })
  assert.match(result.diff, /changed/)
  assert.deepEqual(result.untracked, ['new.txt'])
})

test('test.run accepts only pinned profile argv and blocks network by default', async (t) => {
  const root = await fixture(t)
  const profile = defineTestProfile('unit', { executable: '/usr/bin/node', argv: ['-e', "process.stdout.write('ok')"], timeoutMs: 1000, sandbox: { network: false } })
  const tool = createTestTool(new Workspace(root), [profile], { bubblewrap: '/usr/bin/bwrap' })
  assert.equal((await tool.execute({ profile: 'unit' })).exitCode, 0)
  assert.equal((await tool.execute({ profile: 'unit' })).stdout, 'ok')
  await assert.rejects(() => tool.execute({ profile: 'sh', extraArg: 'id' }), /profile.*not found|unexpected extraArg/)
})

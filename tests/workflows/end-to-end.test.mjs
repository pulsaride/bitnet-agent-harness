#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { AgentHarness } from '../../src/runtime/harness.ts'

class ScriptedModel {
  #outputs
  constructor(outputs) { this.#outputs = [...outputs] }
  async complete() { return { text: this.#outputs.shift() ?? 'complete', finishReason: 'stop', toolCalls: [], usage: null, raw: {} } }
  async * stream() {}
  async describe() { return { artifact: {}, contextTokens: 4096, chatCompletions: { state: 'verified' }, streaming: { state: 'verified' }, usage: { state: 'unknown' }, nativeToolCalls: { state: 'unsupported' }, structuredOutput: { state: 'verified' }, grammar: { state: 'verified' } } }
}

test('harness validates and executes a model-proposed read through the broker', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'bitnet-e2e-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(path.join(root, 'README.md'), '# Demo\n')
  const skillRoot = path.join(root, 'skills')
  await mkdir(path.join(skillRoot, 'repository-analysis'), { recursive: true })
  await writeFile(path.join(skillRoot, 'repository-analysis', 'SKILL.md'), '---\nname: repository-analysis\ndescription: Analyze repository\nmetadata:\n  version: 1.0.0\n---\n# Analyze\n')
  const harness = new AgentHarness({ workspaceRoot: root, skillRoots: [skillRoot], model: new ScriptedModel([
    '{"protocolVersion":1,"action":{"name":"workspace_read","arguments":{"path":"README.md","offset":0,"limit":100}}}',
    'Read README.md successfully.'
  ]) })
  const result = await harness.run('Read README.md')
  assert.equal(result.status, 'completed')
  assert.match(result.finalText, /README/)
  assert.equal((await harness.readSession(result.runId)).some((event) => event.type === 'tool-executed'), true)
})

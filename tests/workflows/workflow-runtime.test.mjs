#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { JsonlSessionStore } from '../../src/sessions/jsonl-store.ts'
import { WorkflowRunner } from '../../src/workflows/runner.ts'

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'bitnet-workflow-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('workflow rejects failing acceptance even when a model says done', async (t) => {
  const root = await fixture(t)
  const store = new JsonlSessionStore(path.join(root, 'sessions'))
  const runner = new WorkflowRunner({ store })
  const workflow = { id: 'coding/check', version: '1.0.0', inputs: {}, steps: [{ id: 'verify', kind: 'tool', capability: 'process/test', input: {} }], acceptance: { all: ['testExitZero'] } }
  const state = await runner.run(workflow, {}, { 'process/test': async () => ({ exitCode: 1, done: 'model says done' }) })
  assert.equal(state.status, 'failed')
  assert.equal((await store.read(state.runId)).at(-1).type, 'run-finished')
})

test('session recovery ignores truncated final record and reports it', async (t) => {
  const root = await fixture(t)
  await writeFile(path.join(root, 'broken.jsonl'), '{"sequence":1,"type":"run-started"}\n{"sequence":2')
  const store = new JsonlSessionStore(root)
  const result = await store.readWithRecovery('broken')
  assert.equal(result.events.length, 1)
  assert.equal(result.truncatedFinalRecord, true)
})

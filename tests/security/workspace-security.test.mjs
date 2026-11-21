#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Workspace } from '../../src/policy/workspace.ts'
import { createFileTools } from '../../src/tools/file-tools.ts'
import { PolicyBroker } from '../../src/policy/broker.ts'
import { createNativeTool } from '../../src/tools/tool.ts'
import { CapabilityRegistry } from '../../src/capabilities/registry.ts'

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'bitnet-tools-'))
  await mkdir(path.join(root, 'src'))
  await writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1\n')
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('workspace denies traversal, credential paths, and symlink escape', async (t) => {
  const root = await fixture(t)
  const outside = path.join(root, '..', 'outside-secret')
  await writeFile(outside, 'secret')
  t.after(() => rm(outside, { force: true }))
  await symlink(outside, path.join(root, 'link'))
  const workspace = new Workspace(root)
  await assert.rejects(() => workspace.resolve('src/../../outside-secret', false), /outside workspace/)
  await assert.rejects(() => workspace.resolve('link', false), /symlink/)
  await assert.rejects(() => workspace.resolve('.env', false), /credential/)
})

test('read/list/search and stale/ambiguous edit checks are independently executable', async (t) => {
  const root = await fixture(t)
  const workspace = new Workspace(root)
  const tools = createFileTools(workspace)
  const read = await tools.read.execute({ path: 'src/a.ts', offset: 0, limit: 100 })
  assert.match(read.text, /const a = 1/)
  assert.deepEqual((await tools.list.execute({ path: 'src' })).entries, [{ path: 'src/a.ts', kind: 'file' }])
  assert.deepEqual((await tools.search.execute({ path: 'src', query: 'const a', maxResults: 5 })).matches[0].path, 'src/a.ts')
  await assert.rejects(() => tools.edit.execute({ path: 'src/a.ts', baseSha256: '0'.repeat(64), oldText: '1', newText: '2' }), /stale/)
  await writeFile(path.join(root, 'src', 'a.ts'), 'x 1 x 1\n')
  const current = await tools.read.execute({ path: 'src/a.ts', offset: 0, limit: 100 })
  await assert.rejects(() => tools.edit.execute({ path: 'src/a.ts', baseSha256: current.sha256, oldText: '1', newText: '2' }), /ambiguous/)
  const edited = await tools.edit.execute({ path: 'src/a.ts', baseSha256: current.sha256, oldText: 'x 1 x 1\n', newText: 'x 2 x 2\n' })
  assert.equal((await readFile(path.join(root, 'src', 'a.ts'), 'utf8')), 'x 2 x 2\n')
  assert.notEqual(edited.sha256, current.sha256)
})

test('policy binds normalized arguments and validates before dispatch', async (t) => {
  const root = await fixture(t)
  let calls = 0
  const tool = createNativeTool('workspace/read', async () => { calls += 1; return { ok: true } }, { read: ['workspace'] })
  const broker = new PolicyBroker({ workspace: new Workspace(root), grants: [{ capability: 'workspace/read' }] })
  const result = await broker.execute({
    callId: 'call-1', capability: tool.descriptor, arguments: { path: 'src/a.ts' }, source: 'model'
  }, tool, { runId: 'run-1' })
  assert.equal(result.status, 'ok')
  assert.equal(calls, 1)
})

test('policy binds normalized arguments and exact capability pin before dispatch', async (t) => {
  const root = await fixture(t)
  let calls = 0
  const tool = createNativeTool('workspace/read', async () => { calls += 1; return { ok: true } }, { read: ['workspace'] })
  const registry = new CapabilityRegistry()
  const registered = registry.register(tool.descriptor)
  const broker = new PolicyBroker({ workspace: new Workspace(root), registry, grants: [{ capability: 'workspace/read' }] })
  const result = await broker.execute({
    callId: 'call-1', capability: registered, arguments: { path: 'src/a.ts' }, source: 'model'
  }, tool, { runId: 'run-1' })
  assert.equal(result.status, 'ok')
  assert.equal(calls, 1)

  const substituted = await broker.execute({
    callId: 'call-2', capability: { ...registered, digest: '0'.repeat(64) }, arguments: { path: 'src/a.ts' }, source: 'model'
  }, tool, { runId: 'run-1' })
  assert.equal(substituted.status, 'denied')
  assert.equal(substituted.error.code, 'capability_mismatch')
  assert.equal(calls, 1)
})

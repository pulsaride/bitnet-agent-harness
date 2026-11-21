#!/usr/bin/env node
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CapabilityRegistry } from '../../src/capabilities/registry.ts'
import { validateJsonSchema } from '../../src/capabilities/schema.ts'

const descriptor = (overrides = {}) => ({
  protocolVersion: 1,
  id: 'workspace/read',
  version: '1.0.0',
  description: 'Read a file',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
  outputSchema: { type: 'object', properties: {}, additionalProperties: true },
  permissions: { read: ['workspace'], write: [], network: [], process: false },
  limits: { timeoutMs: 1000, maxOutputBytes: 1024 },
  implementation: { kind: 'native', entry: 'workspace.read' },
  ...overrides
})

test('registry rejects collisions and unsupported versions', () => {
  const registry = new CapabilityRegistry()
  registry.register(descriptor())
  assert.throws(() => registry.register(descriptor()), /duplicate capability/)
  assert.throws(() => registry.register(descriptor({ id: 'workspace/list', protocolVersion: 2 })), /protocolVersion/)
})

test('registry sorts and resolves an exact pin', () => {
  const registry = new CapabilityRegistry()
  const read = registry.register(descriptor())
  registry.register(descriptor({ id: 'git/diff', description: 'Diff files' }))
  assert.deepEqual(registry.list().map((item) => item.id), ['git/diff', 'workspace/read'])
  assert.equal(registry.resolve(read.id, read.version, read.digest).digest, read.digest)
})

test('JSON Schema rejects unsupported dialect features and invalid input', () => {
  assert.throws(() => validateJsonSchema('no', { type: 'string', format: 'email' }), /unsupported schema keyword: format/)
  assert.deepEqual(validateJsonSchema({ path: 'a' }, descriptor().inputSchema), { valid: true })
  assert.equal(validateJsonSchema({ path: 'a', extra: true }, descriptor().inputSchema).valid, false)
})

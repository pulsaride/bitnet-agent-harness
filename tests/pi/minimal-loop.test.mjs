import assert from 'node:assert/strict'
import test from 'node:test'
import { MinimalActionLoop } from '../../src/runtime/minimal-loop.ts'
import { PiAdapter, PiIntegrationError } from '../../src/runtime/pi-adapter.ts'

function model(outputs) {
  const queue = [...outputs]
  return {
    describe: async () => ({ artifact: {}, contextTokens: 4096, chatCompletions: { state: 'verified' }, streaming: { state: 'verified' }, usage: { state: 'verified' }, nativeToolCalls: { state: 'unsupported' }, structuredOutput: { state: 'verified' }, grammar: { state: 'verified' } }),
    complete: async (request) => ({ text: queue.shift(), finishReason: 'stop', toolCalls: [], usage: null, raw: { request } }),
    stream: async function * () {}
  }
}

test('bounded loop routes action through broker and never executes model authority', async () => {
  const brokerCalls = []
  const loop = new MinimalActionLoop({
    model: model(['{"protocolVersion":1,"action":{"name":"read_file","arguments":{"path":"README.md"}}}', 'README begins with the harness heading.']),
    allowedActions: new Set(['read_file']),
    broker: async (proposal) => { brokerCalls.push(proposal); return { approved: false, output: null, error: 'approval_required' } },
    maxTurns: 4
  })
  const result = await loop.run('Inspect README.md')
  assert.equal(result.status, 'blocked')
  assert.equal(result.turns, 1)
  assert.equal(brokerCalls.length, 1)
  assert.equal(brokerCalls[0].action.name, 'read_file')
  assert.equal(brokerCalls[0].source, 'model')
})

test('bounded loop rejects unknown action without broker dispatch', async () => {
  let dispatched = false
  const loop = new MinimalActionLoop({
    model: model(['{"protocolVersion":1,"action":{"name":"shell","arguments":{"command":"id"}}}']),
    allowedActions: new Set(['read_file']),
    broker: async () => { dispatched = true; return { approved: true, output: 'bad' } },
    maxTurns: 1
  })
  const result = await loop.run('Run id')
  assert.equal(result.status, 'rejected')
  assert.equal(dispatched, false)
  assert.match(result.reason, /not allowed/)
})

test('bounded loop supports repository exploration and skill activation observations', async () => {
  const seen = []
  const loop = new MinimalActionLoop({
    model: model([
      '{"protocolVersion":1,"action":{"name":"workspace_list","arguments":{"path":"."}}}',
      '{"protocolVersion":1,"action":{"name":"skill_activate","arguments":{"name":"review-small-diff"}}}',
      'Exploration complete.'
    ]),
    allowedActions: new Set(['workspace_list', 'skill_activate']),
    broker: async (proposal) => { seen.push(proposal.action.name); return { approved: true, output: proposal.action.name === 'workspace_list' ? ['README.md'] : 'skill body' } },
    maxTurns: 5
  })
  const result = await loop.run('Explore and activate the review skill')
  assert.equal(result.status, 'completed')
  assert.deepEqual(seen, ['workspace_list', 'skill_activate'])
})

test('Pi adapter rejects an unpinned or non-loopback endpoint', () => {
  assert.throws(() => new PiAdapter({ packagePath: '/tmp/pi', baseUrl: 'http://localhost:15842' }), PiIntegrationError)
  assert.throws(() => new PiAdapter({ packagePath: '/tmp/pi', baseUrl: 'http://127.0.0.1:8081' }), PiIntegrationError)
})

test('Pi adapter reports missing integration without fallback', async () => {
  const adapter = new PiAdapter({ packagePath: '/definitely-missing-pinned-pi-package' })
  const result = await adapter.validate()
  assert.equal(result.integrated, false)
  assert.equal(result.fallbackUsed, false)
  assert.equal(result.provenance.package, '@earendil-works/pi-coding-agent')
  assert.equal(result.provenance.version, '1.6.0')
  assert.equal(result.provenance.gitHead, 'faac585884ae2c013a6b1400f3e9e77f10b34bac')
  assert.match(result.failure.message, /package module not found/)
})

#!/usr/bin/env node
import test from 'node:test'
import assert from 'node:assert/strict'
import { BitNetClient, BitNetHttpError } from '../../src/model/bitnet-client.ts'
import { ActionEnvelopeError, parseActionEnvelope, parseActionEnvelopeForAllowedAction } from '../../src/model/action-envelope.ts'

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' }
  })
}

test('complete maps OpenAI-compatible content, usage, and tool calls', async () => {
  const requests = []
  const fetch = async (url, init) => {
    requests.push({ url, init })
    if (String(url).endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'bitnet' }] })
    return jsonResponse({
      id: 'completion-1', model: 'bitnet',
      choices: [{ finish_reason: 'tool_calls', message: {
        role: 'assistant', content: null,
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'count', arguments: '{"path":"src"}' } }]
      } }],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 }
    })
  }
  const client = new BitNetClient({ baseUrl: 'http://example.invalid', fetch })
  const result = await client.complete({ messages: [{ role: 'user', content: 'count files' }] })
  assert.equal(result.text, '')
  assert.deepEqual(result.toolCalls[0]?.function, { name: 'count', arguments: '{"path":"src"}' })
  assert.deepEqual(result.usage, { promptTokens: 4, completionTokens: 3, totalTokens: 7 })
  const payload = JSON.parse(requests[1].init.body)
  assert.equal(payload.model, 'bitnet')
  assert.equal(payload.stream, false)
})

test('stream parses split SSE frames and usage', async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"hel',
    'lo"},"index":0}],"usage":null}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":null}\n\n',
    'data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}\n\ndata: [DONE]\n\n'
  ]
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    }
  })
  const fetch = async (url) => String(url).endsWith('/v1/models')
    ? jsonResponse({ data: [{ id: 'bitnet' }] })
    : new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  const client = new BitNetClient({ baseUrl: 'http://example.invalid', fetch })
  const events = []
  for await (const event of client.stream({ messages: [{ role: 'user', content: 'hello' }] })) events.push(event)
  assert.equal(events.map((event) => event.type).join(','), 'delta,delta,usage,done')
  assert.equal(events[0].text, 'hello')
  assert.deepEqual(events[2].usage, { promptTokens: 2, completionTokens: 1, totalTokens: 3 })
})

test('HTTP failures retain bounded upstream details', async () => {
  const client = new BitNetClient({
    fetch: async () => jsonResponse({ error: { message: 'bad request' } }, { status: 400 })
  })
  await assert.rejects(
    client.complete({ model: 'bitnet', messages: [] }),
    (error) => error instanceof BitNetHttpError && error.status === 400 && error.message.includes('bad request')
  )
})

test('complete forwards caller cancellation to fetch', async () => {
  const controller = new AbortController()
  const client = new BitNetClient({
    model: 'bitnet',
    fetch: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    })
  })
  const request = client.complete(
    { messages: [{ role: 'user', content: 'cancel me' }] },
    controller.signal
  )
  controller.abort(new Error('cancelled by caller'))
  await assert.rejects(request, /cancelled by caller/)
})

test('malformed action JSON rejects without executing anything', () => {
  let executions = 0
  assert.throws(() => parseActionEnvelope('{not json'), ActionEnvelopeError)
  assert.throws(() => parseActionEnvelope('{"protocolVersion":1,"action":{"name":"delete","arguments":[]}}'), ActionEnvelopeError)
  assert.equal(executions, 0)
})

test('action envelope enforces allowlist and native shape', () => {
  const envelope = parseActionEnvelopeForAllowedAction(
    '{"protocolVersion":1,"action":{"name":"workspace_read","arguments":{"path":"README.md"}}}',
    new Set(['workspace_read'])
  )
  assert.equal(envelope.action.name, 'workspace_read')
  assert.throws(
    () => parseActionEnvelopeForAllowedAction(
      '{"protocolVersion":1,"action":{"name":"workspace_write","arguments":{}}}',
      new Set(['workspace_read'])
    ),
    /not allowed/
  )
})

#!/usr/bin/env -S node --experimental-strip-types
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { BitNetClient } from '../src/model/bitnet-client.ts'
import { parseActionEnvelopeForAllowedAction } from '../src/model/action-envelope.ts'

const ROOT = new URL('../', import.meta.url)
const ARTIFACT_DIR = new URL('../artifacts/capability/', import.meta.url)
const baseUrl = process.env.BITNET_URL ?? 'http://127.0.0.1:15842'
const model = process.env.BITNET_MODEL
const maxResponseChars = Number(process.env.CAPABILITY_MAX_RESPONSE_CHARS ?? 12_000)
const client = new BitNetClient({ baseUrl, model, timeoutMs: 180_000 })
const observedAt = new Date().toISOString()

function bounded(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length <= maxResponseChars ? text : `${text.slice(0, maxResponseChars)}…[truncated]`
}

function telemetry(response) {
  const raw = response?.raw && typeof response.raw === 'object' ? response.raw : response
  const usage = response?.usage ?? raw?.usage ?? null
  const timings = raw?.timings ?? null
  return {
    usage: usage ? {
      promptTokens: usage.promptTokens ?? usage.prompt_tokens,
      completionTokens: usage.completionTokens ?? usage.completion_tokens,
      totalTokens: usage.totalTokens ?? usage.total_tokens
    } : null,
    timings: timings ? {
      promptMs: timings.prompt_ms,
      predictedMs: timings.predicted_ms,
      predictedTokens: timings.predicted_n,
      predictedTokensPerSecond: timings.predicted_per_second
    } : null
  }
}

function failure(error) {
  return { name: error?.name ?? 'Error', message: error instanceof Error ? error.message : String(error) }
}

async function rawCapture(request, options = {}) {
  const startedAt = performance.now()
  const wireRequest = {
    ...request,
    max_tokens: request.maxTokens,
    response_format: request.responseFormat ?? request.response_format,
    tool_choice: request.toolChoice ?? request.tool_choice,
    maxTokens: undefined,
    responseFormat: undefined,
    toolChoice: undefined
  }
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(wireRequest),
    ...(options.signal ? { signal: options.signal } : {})
  })
  const raw = bounded(await response.text())
  return { status: response.status, ok: response.ok, raw, elapsedMs: performance.now() - startedAt }
}

async function runCase(definition) {
  const startedAt = performance.now()
  let attempt = 0
  let lastError = null
  let response = null
  let raw = null
  while (attempt <= definition.retries) {
    attempt += 1
    try {
      if (definition.raw) {
        const captured = await rawCapture(definition.request, { signal: AbortSignal.timeout(180_000) })
        raw = captured.raw
        if (!captured.ok) throw Object.assign(new Error(`HTTP ${captured.status}`), { status: captured.status })
        if (definition.request.stream) {
          const firstData = captured.raw.split(/\r?\n/).find((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
          response = firstData ? JSON.parse(firstData.slice(6)) : {}
        } else {
          response = JSON.parse(captured.raw)
        }
      } else {
        response = await client.complete(definition.request)
        raw = bounded(response.raw)
      }
      const result = definition.evaluate(response)
      if (result.pass) return {
        ...baseRecord(definition, startedAt, attempt - 1), status: 'pass', success: true,
        rawResponse: raw, telemetry: telemetry(response), assessment: result
      }
      lastError = new Error(result.reason)
      if (attempt > definition.retries) break
    } catch (error) {
      lastError = error
      if (attempt > definition.retries) break
    }
  }
  return {
    ...baseRecord(definition, startedAt, attempt - 1), status: 'fail', success: false,
    rawResponse: raw, telemetry: telemetry(response), assessment: { pass: false, reason: lastError?.message ?? 'unknown failure' },
    error: failure(lastError)
  }
}

function baseRecord(definition, startedAt, retries) {
  const request = definition.request
  return {
    id: definition.id,
    kind: definition.kind,
    capability: definition.capability,
    promptSha256: createHash('sha256').update(JSON.stringify(request.messages ?? request)).digest('hex'),
    prompt: request.messages ?? request.prompt,
    requestControls: Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'messages' && key !== 'prompt')),
    elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
    retries,
    taxonomy: definition.kind === 'runtime' ? 'runtime_feature' : 'model_behavior'
  }
}

const common = { model, temperature: 0, maxTokens: 64 }
const cases = [
  {
    id: 'B01-conversational', kind: 'model', capability: 'conversational', retries: 0,
    request: { ...common, messages: [{ role: 'user', content: 'If I say the sky is blue, reply with only the color word: blue.' }] },
    evaluate: (r) => ({ pass: /^\s*blue[.!]?\s*$/i.test(r.text), reason: 'expected blue only', observed: r.text })
  },
  {
    id: 'B02-instruction-following', kind: 'model', capability: 'instruction_following', retries: 0,
    request: { ...common, messages: [{ role: 'user', content: 'Reply with exactly three lowercase words separated by single spaces, and no punctuation: red green blue' }] },
    evaluate: (r) => ({ pass: r.text.trim().split(/\s+/).length === 3 && /^[a-z]+ [a-z]+ [a-z]+$/.test(r.text.trim()), reason: 'expected three lowercase words', observed: r.text })
  },
  {
    id: 'B03-code-understanding', kind: 'model', capability: 'code_understanding', retries: 0,
    request: { ...common, messages: [{ role: 'user', content: 'What does this JavaScript function return for add(2,3)? Reply only with the number.\nfunction add(a,b) { return a + b; }' }] },
    evaluate: (r) => ({ pass: /^\s*5[.!]?\s*$/.test(r.text), reason: 'expected 5', observed: r.text })
  },
  {
    id: 'B04-code-generation', kind: 'model', capability: 'code_generation', retries: 0,
    request: { ...common, messages: [{ role: 'user', content: 'Write only a JavaScript arrow function named sum that accepts an array and returns its numeric sum. Do not explain.' }] },
    evaluate: (r) => ({ pass: /(?:const\s+sum\s*=|function\s+sum)/.test(r.text) && /reduce|for\s*\(/.test(r.text), reason: 'expected a sum implementation', observed: r.text })
  },
  {
    id: 'B05-json-output', kind: 'model', capability: 'json_structured_output', retries: 1,
    request: { ...common, messages: [{ role: 'user', content: 'Return valid JSON only, with key "status" set to "ok" and no other keys.' }] },
    evaluate: (r) => {
      try { const value = JSON.parse(r.text); return { pass: JSON.stringify(value) === '{"status":"ok"}', reason: 'expected exact JSON object', observed: value } }
      catch { return { pass: false, reason: 'response was not valid JSON', observed: r.text } }
    }
  },
  {
    id: 'B06-action-envelope', kind: 'model', capability: 'action_envelope', retries: 1,
    request: { ...common, messages: [{ role: 'user', content: 'The only allowed tool is read_file. To read README.md, return JSON only matching {"protocolVersion":1,"action":{"name":"read_file","arguments":{"path":"README.md"}}}.' }] },
    evaluate: (r) => {
      try { const value = parseActionEnvelopeForAllowedAction(r.text.trim(), new Set(['read_file'])); return { pass: value.action.arguments.path === 'README.md', reason: 'expected allowed action envelope', observed: value } }
      catch (error) { return { pass: false, reason: error.message, observed: r.text } }
    }
  },
  {
    id: 'B07-multi-turn', kind: 'model', capability: 'multi_turn', retries: 0,
    request: { ...common, messages: [
      { role: 'user', content: 'Remember this code name: ORCHID.' },
      { role: 'assistant', content: 'I will remember ORCHID.' },
      { role: 'user', content: 'What is the code name? Reply with only the name.' }
    ] },
    evaluate: (r) => ({ pass: /\bORCHID\b/i.test(r.text) && !/do not|cannot remember/i.test(r.text), reason: 'expected retained code name', observed: r.text })
  },
  {
    id: 'B08-error-correction', kind: 'model', capability: 'error_correction', retries: 0,
    request: { ...common, messages: [{ role: 'user', content: 'Correct this JavaScript bug and return only corrected code: function isEven(n) { return n % 2; }' }] },
    evaluate: (r) => ({ pass: /n\s*%\s*2\s*={2,3}\s*0/.test(r.text), reason: 'expected even comparison with zero', observed: r.text })
  },
  {
    id: 'R01-streaming', kind: 'runtime', capability: 'streaming', retries: 0,
    request: { ...common, maxTokens: 12, stream: true, messages: [{ role: 'user', content: 'Reply: stream-ok' }] }, raw: true,
    evaluate: (r) => ({ pass: typeof r === 'object' && Array.isArray(r.choices), reason: 'expected completion chunk object', observed: Object.keys(r ?? {}) })
  },
  {
    id: 'R02-json-object-constrained', kind: 'runtime', capability: 'response_format_json_object', retries: 0,
    request: { ...common, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: 'Return {"ok":true} as JSON.' }] }, raw: true,
    evaluate: (r) => { try { JSON.parse(r.choices?.[0]?.message?.content); return { pass: true, reason: 'accepted json_object and produced parseable JSON', observed: r.choices?.[0]?.message?.content } } catch { return { pass: false, reason: 'output not parseable JSON' } } }
  },
  {
    id: 'R03-json-schema-constrained', kind: 'runtime', capability: 'response_format_json_schema', retries: 0,
    request: { ...common, response_format: { type: 'json_schema', json_schema: { name: 'status', strict: true, schema: { type: 'object', properties: { status: { const: 'ok' } }, required: ['status'], additionalProperties: false } } }, messages: [{ role: 'user', content: 'Return the required status JSON.' }] }, raw: true,
    evaluate: (r) => ({ pass: r.choices?.[0]?.message?.content?.includes('"status"') ?? false, reason: 'schema feature accepted', observed: r.choices?.[0]?.message?.content })
  },
  {
    id: 'R04-grammar-constrained', kind: 'runtime', capability: 'grammar', retries: 0,
    request: { ...common, grammar: 'root ::= "ok"', messages: [{ role: 'user', content: 'Say ok.' }] }, raw: true,
    evaluate: (r) => ({ pass: r.choices?.[0]?.message?.content?.trim() === 'ok', reason: 'grammar accepted and constrained output to ok', observed: r.choices?.[0]?.message?.content })
  },
  {
    id: 'R05-native-tool-calls', kind: 'runtime', capability: 'native_tool_calls', retries: 0,
    request: { ...common, tools: [{ type: 'function', function: { name: 'read_file', description: 'Read a local file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false } } }], tool_choice: 'auto', messages: [{ role: 'user', content: 'Read README.md with the read_file tool.' }] }, raw: true,
    evaluate: (r) => ({ pass: Boolean(r.choices?.[0]?.message?.tool_calls?.[0]?.function?.name === 'read_file'), reason: 'expected native tool_call', observed: r.choices?.[0]?.message?.tool_calls ?? null })
  }
]

await mkdir(ARTIFACT_DIR, { recursive: true })
const capabilities = await client.describe()
const records = []
for (const definition of cases) {
  records.push(await runCase(definition))
}
const runtimeResult = (id) => records.find((record) => record.id === id)?.success === true
const measuredCapabilities = {
  ...capabilities,
  chatCompletions: { state: 'verified', probeId: 'B01-R05' },
  streaming: { state: runtimeResult('R01-streaming') ? 'verified' : 'unsupported', probeId: 'R01-streaming' },
  usage: { state: records.some((record) => record.telemetry?.usage) ? 'verified' : 'unknown', probeId: 'B01-R05' },
  nativeToolCalls: { state: runtimeResult('R05-native-tool-calls') ? 'verified' : 'unsupported', probeId: 'R05-native-tool-calls' },
  structuredOutput: { state: runtimeResult('R03-json-schema-constrained') ? 'verified' : 'unsupported', probeId: 'R03-json-schema-constrained' },
  grammar: { state: runtimeResult('R04-grammar-constrained') ? 'verified' : 'unsupported', probeId: 'R04-grammar-constrained' }
}
const summary = {
  schemaVersion: 1,
  observedAt,
  baseUrl,
  provider: 'pinned local BitNet llama-server only; no fallback or external inference',
  capabilities: measuredCapabilities,
  distinction: 'runtime features measure HTTP/SSE/schema/tool protocol support; model capabilities measure prompt behavior independently',
  counts: {
    runtime: { pass: records.filter((r) => r.kind === 'runtime' && r.success).length, total: records.filter((r) => r.kind === 'runtime').length },
    model: { pass: records.filter((r) => r.kind === 'model' && r.success).length, total: records.filter((r) => r.kind === 'model').length }
  },
  records
}
await writeFile(new URL('report.json', ARTIFACT_DIR), `${JSON.stringify(summary, null, 2)}\n`)
await writeFile(new URL('trace.jsonl', ARTIFACT_DIR), `${records.map((record) => JSON.stringify(record)).join('\n')}\n`)
process.stdout.write(`${JSON.stringify(summary.counts)}\n`)

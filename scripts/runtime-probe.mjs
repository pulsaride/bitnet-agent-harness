#!/usr/bin/env node
import { performance } from 'node:perf_hooks'

const baseUrl = process.env.BITNET_URL ?? 'http://127.0.0.1:15842'
const prompt = process.env.BITNET_PROMPT ?? 'Reply with exactly: BitNet is ready.'
const maxTokens = Number(process.env.BITNET_MAX_TOKENS ?? 32)
const streaming = process.argv.includes('--stream')

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.text()
  if (!response.ok) throw new Error(`${options?.method ?? 'GET'} ${path}: HTTP ${response.status}: ${body}`)
  return body
}

const startedAt = performance.now()
const health = JSON.parse(await request('/health'))
const models = JSON.parse(await request('/v1/models'))
const payload = {
  model: models.data?.[0]?.id ?? 'bitnet',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0,
  max_tokens: maxTokens,
  stream: streaming
}
const inferenceStartedAt = performance.now()
let body
let firstByteMs = null
let outputText = ''
if (streaming) {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!response.ok || !response.body) throw new Error(`stream: HTTP ${response.status}: ${await response.text()}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (firstByteMs === null) firstByteMs = performance.now() - inferenceStartedAt
    body = `${body ?? ''}${decoder.decode(value, { stream: true })}`
  }
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    const event = JSON.parse(line.slice(6))
    outputText += event.choices?.[0]?.delta?.content ?? ''
  }
} else {
  body = await request('/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  firstByteMs = performance.now() - inferenceStartedAt
  outputText = JSON.parse(body).choices?.[0]?.message?.content ?? ''
}
const elapsedMs = performance.now() - inferenceStartedAt
const usage = streaming ? null : JSON.parse(body).usage
const decodedTokens = usage?.completion_tokens ?? outputText.trim().split(/\s+/).filter(Boolean).length
process.stdout.write(`${JSON.stringify({
  baseUrl,
  mode: streaming ? 'stream' : 'non-stream',
  probeElapsedMs: Number((performance.now() - startedAt).toFixed(2)),
  inferenceMs: Number(elapsedMs.toFixed(2)),
  ttftMs: Number((firstByteMs ?? elapsedMs).toFixed(2)),
  output: outputText,
  usage,
  approximateTokensPerSecond: elapsedMs > 0 ? Number((decodedTokens / (elapsedMs / 1000)).toFixed(2)) : null,
  health,
  model: payload.model
})}\n`)

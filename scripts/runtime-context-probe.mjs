#!/usr/bin/env node
const baseUrl = process.env.BITNET_URL ?? 'http://127.0.0.1:15842'
const modelsResponse = await fetch(`${baseUrl}/v1/models`)
if (!modelsResponse.ok) throw new Error(`models endpoint returned ${modelsResponse.status}`)
const models = await modelsResponse.json()
const oversizedPrompt = `repeat token `.repeat(9000)
const response = await fetch(`${baseUrl}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: models.data?.[0]?.id ?? 'bitnet',
    messages: [{ role: 'user', content: oversizedPrompt }],
    max_tokens: 1,
    temperature: 0
  })
})
const text = await response.text()
process.stdout.write(`${JSON.stringify({
  expectedContextTokens: 4096,
  inputWords: 18000,
  status: response.status,
  accepted: response.ok,
  response: text.slice(0, 1000)
})}\n`)
if (response.ok) process.exitCode = 1

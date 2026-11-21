#!/usr/bin/env -S node --experimental-strip-types
import { mkdir, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { BitNetClient } from '../src/model/bitnet-client.ts'
import { PiAdapter } from '../src/runtime/pi-adapter.ts'
import { MinimalActionLoop } from '../src/runtime/minimal-loop.ts'

const endpoint = 'http://127.0.0.1:15842'
const artifactDir = new URL('../artifacts/pi/', import.meta.url)
const observedAt = new Date().toISOString()
const packagePath = process.env.PI_PINNED_PACKAGE_PATH ?? '/definitely-missing-pinned-pi-package'
const pi = new PiAdapter({ packagePath })
const piResult = await pi.validate()
const client = new BitNetClient({ baseUrl: endpoint, timeoutMs: 30_000 })
const cases = []

async function capture(id, run) {
  const startedAt = performance.now()
  try {
    const value = await run()
    cases.push({ id, status: 'pass', elapsedMs: Number((performance.now() - startedAt).toFixed(2)), value })
  } catch (error) {
    cases.push({ id, status: 'fail', elapsedMs: Number((performance.now() - startedAt).toFixed(2)), failure: { name: error?.name ?? 'Error', message: error instanceof Error ? error.message : String(error) } })
  }
}

await capture('R01-model-capabilities', () => client.describe())
await capture('R02-system-instruction', async () => {
  const result = await client.complete({ messages: [{ role: 'system', content: 'Reply only: system-ok' }, { role: 'user', content: 'Acknowledge.' }], temperature: 0, maxTokens: 8 })
  if (!/system-ok/i.test(result.text)) throw new Error(`system instruction not followed: ${result.text}`)
  return { text: result.text, finishReason: result.finishReason }
})
await capture('R03-streaming', async () => {
  const chunks = []
  for await (const event of client.stream({ messages: [{ role: 'user', content: 'Reply exactly: stream-ok' }], temperature: 0, maxTokens: 8 })) chunks.push(event)
  if (!chunks.some((event) => event.type === 'done')) throw new Error('stream completed without done event')
  return { eventTypes: chunks.map((event) => event.type), text: chunks.filter((event) => event.type === 'delta').map((event) => event.text ?? '').join('') }
})
await capture('R04-action-envelope-broker-boundary', async () => {
  let brokerCalls = 0
  const loop = new MinimalActionLoop({
    model: client,
    allowedActions: new Set(['read_file']),
    broker: async (proposal) => {
      brokerCalls += 1
      return { approved: false, output: null, error: 'approval_required', observation: { proposal } }
    },
    maxTurns: 2,
    maxTokens: 96
  })
  const result = await loop.run('To read README.md, return only the allowed JSON action envelope for read_file with path README.md.')
  if (result.status !== 'blocked' || brokerCalls !== 1) throw new Error(`action envelope did not reach denied broker boundary: status=${result.status}, calls=${brokerCalls}`)
  return { result, brokerCalls, executed: false }
})

await mkdir(artifactDir, { recursive: true })
const summary = {
  schemaVersion: 1,
  observedAt,
  endpoint,
  pi: piResult,
  counts: { pass: cases.filter((item) => item.status === 'pass').length, total: cases.length },
  cases,
  scope: {
    interactiveChat: 'not run: Pi package was not available through an immutable local module path',
    noninteractiveChat: 'BitNet model client validated independently',
    sessions: 'Pi blocked; independent loop session transcript is in-memory and bounded',
    systemInstructions: 'runtime supports role transport; BitNet chat template rejects system-role semantics',
    repositoryExploration: 'not directly granted; only broker proposal tested',
    fileReading: 'not directly granted; only broker proposal tested',
    toolExecution: cases.find((item) => item.id === 'R04-action-envelope-broker-boundary')?.status === 'pass'
      ? 'never executed; broker denied action envelope'
      : 'not reached; model did not produce a valid action envelope for the broker',
    skills: 'Pi discovery/activation blocked; independent parser/broker tests cover separate loop only'
  }
}
await writeFile(new URL('provenance.json', artifactDir), `${JSON.stringify(piResult.provenance, null, 2)}\n`)
await writeFile(new URL('report.json', artifactDir), `${JSON.stringify(summary, null, 2)}\n`)
await writeFile(new URL('trace.jsonl', artifactDir), `${cases.map((item) => JSON.stringify(item)).join('\n')}\n`)
process.stdout.write(`${JSON.stringify(summary.counts)}\n`)

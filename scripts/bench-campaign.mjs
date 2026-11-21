#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { FAILURE_CATEGORIES, TASK_IDS, recipeFor, sha256 } from './bench-lib.mjs'

const exec = promisify(execFile)
export function validateTrialRecord(record) {
  if (!record || record.schemaVersion !== 1) throw new Error('trial schemaVersion must be 1')
  if (!TASK_IDS.includes(record.task)) throw new Error('trial task is invalid')
  if (typeof record.accepted !== 'boolean') throw new Error('trial accepted must be boolean')
  if (!record.accepted && (!record.failure || !FAILURE_CATEGORIES.includes(record.failure.primary))) throw new Error('failure category is invalid')
  return true
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) await main()

async function main() {
  const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
  const condition = 'independent-bitnet-action-loop-baseline'
  const campaignId = process.env.BENCH_CAMPAIGN_ID ?? new Date().toISOString().replace(/[:.]/g, '-')
  const artifactRoot = path.join(repoRoot, 'artifacts', 'benchmarks')
  const campaignRoot = path.join(artifactRoot, 'campaigns', campaignId)
  const checkpointPath = path.join(campaignRoot, 'checkpoint.json')
  const recordsPath = path.join(campaignRoot, 'trials.jsonl')
  await mkdir(campaignRoot, { recursive: true })
  let checkpoint
  try { checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8')) }
  catch (error) { if (error?.code !== 'ENOENT') throw error; checkpoint = { schemaVersion: 1, campaignId, condition, nextIndex: 0, completed: [], createdAt: new Date().toISOString() } }
  for (let index = checkpoint.nextIndex; index < TASK_IDS.length; index += 1) {
    const task = TASK_IDS[index]
    const trial = await runTrial({ repoRoot, campaignRoot, campaignId, condition, task, repetition: 1 })
    validateTrialRecord(trial)
    await appendFile(recordsPath, `${JSON.stringify(trial)}\n`)
    checkpoint = { ...checkpoint, nextIndex: index + 1, completed: [...checkpoint.completed, task], updatedAt: new Date().toISOString() }
    await writeFile(`${checkpointPath}.part`, `${JSON.stringify(checkpoint, null, 2)}\n`)
    await import('node:fs/promises').then(({ rename }) => rename(`${checkpointPath}.part`, checkpointPath))
  }
  const summary = { ...checkpoint, finishedAt: new Date().toISOString(), observations: TASK_IDS.length, record: recordsPath }
  await writeFile(path.join(campaignRoot, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ campaignId, completed: summary.completed.length, condition })}\n`)
}

async function runTrial({ repoRoot, campaignRoot, campaignId, condition, task, repetition }) {
  const startedAt = new Date().toISOString()
  const started = Date.now()
  const source = path.join(repoRoot, 'benchmarks', 'tasks', task, 'snapshot')
  const workspace = path.join(campaignRoot, 'workspaces', `${task}-r${repetition}`)
  await rm(workspace, { recursive: true, force: true })
  await cp(source, workspace, { recursive: true })
  const manifest = JSON.parse(await readFile(path.join(workspace, 'manifest.json'), 'utf8'))
  const endpoint = process.env.BITNET_URL ?? 'http://127.0.0.1:15842'
  const prompt = `${manifest.prompt}\n\nEdit only ${manifest.targetPath}. Run the pinned visible test command yourself only through the benchmark test tool. Return a short status when done.`
  try {
    const cliArgs = ['--experimental-strip-types', path.join(repoRoot, 'bin/bith.mjs'), 'run', '--workspace', workspace, '--skills', path.join(repoRoot, 'examples/skills'), '--endpoint', endpoint, '--json', prompt]
    const { stdout, stderr } = await exec(process.execPath, cliArgs, { cwd: repoRoot, timeout: 30_000, maxBuffer: 4 * 1024 * 1024, env: { PATH: '/usr/bin:/bin', HOME: workspace, LANG: 'C.UTF-8' } })
    const cli = JSON.parse(stdout)
    const result = cli.data
    const accepted = false
    const category = result?.status === 'failed' && /fetch failed|ECONNREFUSED/i.test(result.reason ?? '') ? 'transport' : result?.status === 'rejected' ? 'format' : result?.status === 'blocked' ? 'policy_denial' : result?.status === 'exhausted' ? 'budget' : 'verification'
    return { schemaVersion: 1, campaignId, condition, task, repetition, startedAt, finishedAt: new Date().toISOString(), wallMs: Date.now() - started, accepted, failure: { primary: category, contributing: [], firstFailingStep: 'model-action-loop' }, harnessResult: result, stderrTail: stderr.slice(-4096), trace: null, diffSha256: null, telemetry: { modelCalls: null, toolCalls: null, tokens: null, timings: null, peakMemory: null, reason: 'minimal loop result does not expose per-call telemetry' }, hashes: { snapshotManifest: sha256(JSON.stringify(manifest)), mutation: manifest.mutationSha256 } }
  } catch (error) {
    const stderr = String(error?.stderr ?? error?.message ?? error).slice(-4096)
    const transport = /fetch failed|ECONNREFUSED/i.test(stderr)
    return { schemaVersion: 1, campaignId, condition, task, repetition, startedAt, finishedAt: new Date().toISOString(), wallMs: Date.now() - started, accepted: false, failure: { primary: transport ? 'transport' : 'environment', contributing: [], firstFailingStep: transport ? 'BitNet model request' : 'harness invocation' }, error: stderr, telemetry: { modelCalls: null, toolCalls: null, tokens: null, timings: null, peakMemory: null, reason: 'trial did not produce telemetry' }, hashes: { snapshotManifest: sha256(JSON.stringify(manifest)), mutation: manifest.mutationSha256 } }
  } finally {
    await writeFile(path.join(campaignRoot, 'latest-task.txt'), `${task}\n`)
  }
}

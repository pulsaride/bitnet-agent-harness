#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { FAILURE_CATEGORIES, TASK_IDS, gitRead, hashTree, listFiles, recipeFor, sha256 } from './bench-lib.mjs'

const exec = promisify(execFile)
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
const benchmarksRoot = path.join(repoRoot, 'benchmarks')
const artifactRoot = path.join(repoRoot, 'artifacts', 'benchmarks')
const capped = process.env.BENCH_CAPPED_PATH
const sourceGitDir = process.env.BENCH_PARENT_GIT_DIR
if (!capped || !sourceGitDir) throw new Error('BENCH_CAPPED_PATH and BENCH_PARENT_GIT_DIR are required for qualification')
await mkdir(artifactRoot, { recursive: true })

async function runCommand(workspace, command) {
  const started = Date.now()
  try {
    const result = await exec(capped, command.argv, { cwd: path.join(workspace, command.cwd), env: { ...process.env, CARGO_BUILD_JOBS: '4', RUST_TEST_THREADS: '4', PYTHONDONTWRITEBYTECODE: '1', HOME: process.env.HOME ?? os.homedir() }, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
    return { exitCode: 0, elapsedMs: Date.now() - started, stdoutTail: result.stdout.slice(-8000), stderrTail: result.stderr.slice(-8000), timedOut: false }
  } catch (error) {
    return { exitCode: Number(error?.code) || 1, elapsedMs: Date.now() - started, stdoutTail: String(error?.stdout ?? '').slice(-8000), stderrTail: String(error?.stderr ?? '').slice(-8000), timedOut: error?.killed === true }
  }
}

function replaceExactly(source, from, to, label) {
  const first = source.indexOf(from)
  if (first < 0 || source.indexOf(from, first + 1) >= 0) throw new Error(`${label}: repair preimage must occur exactly once`)
  return `${source.slice(0, first)}${to}${source.slice(first + from.length)}`
}

async function verifyManifest(id) {
  const snapshot = path.join(benchmarksRoot, 'tasks', id, 'snapshot')
  const manifest = JSON.parse(await readFile(path.join(snapshot, 'manifest.json'), 'utf8'))
  const actual = []
  for (const { path: relative, sha256: expected } of manifest.files) {
    actual.push({ relative, expected, actual: sha256(await readFile(path.join(snapshot, relative))) })
  }
  const mismatches = actual.filter(({ expected, actual: digest }) => expected !== digest)
  const unexpected = (await listFiles(snapshot)).filter((file) => file !== 'manifest.json' && !manifest.files.some(({ path: relative }) => relative === file))
  return { ok: mismatches.length === 0 && unexpected.length === 0 && manifest.id === id && manifest.files.length > 0, mismatches, unexpected, manifest }
}

async function qualifyOne(id) {
  const validation = await verifyManifest(id)
  if (!validation.ok) return { id, qualified: false, phase: 'manifest', failure: { primary: 'harness_defect', details: validation } }
  const { from, to, targetPath, command } = recipeFor(id)
  const temporary = await mkdtemp(path.join(os.tmpdir(), `bitnet-g3-${id}-`))
  const clean = path.join(temporary, 'clean')
  const seeded = path.join(temporary, 'seeded')
  const repaired = path.join(temporary, 'repaired')
  try {
    await cp(path.join(benchmarksRoot, 'tasks', id, 'snapshot'), clean, { recursive: true })
    await cp(path.join(benchmarksRoot, 'tasks', id, 'snapshot'), seeded, { recursive: true })
    const target = path.join(clean, targetPath)
    await writeFile(target, await gitRead(sourceGitDir, targetPath))
    const cleanResult = await runCommand(clean, command)
    const seededResult = await runCommand(seeded, command)
    await cp(seeded, repaired, { recursive: true })
    await rm(path.join(repaired, 'tools', 'behaviour-harness', 'engine', '__pycache__'), { recursive: true, force: true })
    const repairedTarget = path.join(repaired, targetPath)
    await writeFile(repairedTarget, await gitRead(sourceGitDir, targetPath))
    const repairedResult = await runCommand(repaired, command)
    const seededTargetHash = sha256(await readFile(path.join(seeded, targetPath)))
    const repairedTree = await hashTree(repaired, ['manifest.json'])
    const cleanTree = await hashTree(clean, ['manifest.json'])
    const cleanRepairIdentical = (await Promise.all(validation.manifest.files.map(async ({ path: relative }) =>
      sha256(await readFile(path.join(clean, relative))) === sha256(await readFile(path.join(repaired, relative)))
    ))).every(Boolean)
    const qualified = cleanResult.exitCode === 0 && seededResult.exitCode !== 0 && repairedResult.exitCode === 0 && cleanRepairIdentical
    return { id, qualified, source: validation.manifest.sourceCommit, target: targetPath, seededTargetHash, phases: { clean: cleanResult, seeded: seededResult, referenceRepair: repairedResult }, cleanRepairIdentical, failureCategories: qualified ? [] : ['harness_defect'] }
  } finally { await rm(temporary, { recursive: true, force: true }) }
}

const startedAt = new Date().toISOString()
const records = []
for (const id of TASK_IDS) {
  const record = await qualifyOne(id)
  records.push(record)
  await appendFile(path.join(artifactRoot, 'qualification.jsonl'), `${JSON.stringify({ ...record, startedAt, recordedAt: new Date().toISOString() })}\n`)
}
const report = { schemaVersion: 1, condition: 'qualification', startedAt, finishedAt: new Date().toISOString(), resourceEnvelope: { memory: '8G', jobs: 4 }, counts: { qualified: records.filter(({ qualified }) => qualified).length, total: records.length }, taxonomy: FAILURE_CATEGORIES, tasks: records }
await writeFile(path.join(artifactRoot, 'qualification.json'), `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(report.counts)}\n`)
if (report.counts.qualified !== report.counts.total) process.exitCode = 1

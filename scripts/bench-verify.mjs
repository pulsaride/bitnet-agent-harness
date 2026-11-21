#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { TASK_IDS } from './bench-lib.mjs'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
const benchmarksRoot = path.join(repoRoot, 'benchmarks')
const failures = []
for (const id of TASK_IDS) {
  const snapshot = path.join(benchmarksRoot, 'tasks', id, 'snapshot')
  const manifest = JSON.parse(await readFile(path.join(snapshot, 'manifest.json'), 'utf8'))
  const visible = JSON.stringify(manifest)
  if (/referenceRepair|fromBase64|toBase64|hiddenEvaluator/.test(visible)) failures.push(`${id}: evaluator-only recipe leaked into snapshot`)
  if (manifest.allowedPaths.length !== 1 || manifest.allowedPaths[0] !== manifest.targetPath) failures.push(`${id}: allowed path policy is not exact`)
}
const recipeFiles = await readdir(path.join(benchmarksRoot, 'evaluator', 'recipes'))
if (recipeFiles.length !== 10) failures.push(`expected 10 evaluator recipes, got ${recipeFiles.length}`)
if (failures.length) { for (const failure of failures) process.stderr.write(`${failure}\n`); process.exitCode = 1 }
else process.stdout.write(`${JSON.stringify({ ok: true, tasks: TASK_IDS.length, leakage: false })}\n`)

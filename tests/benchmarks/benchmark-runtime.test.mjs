import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { TASK_IDS, materializeBenchmarks, recipeFor } from '../../scripts/bench-lib.mjs'

const gitDir = process.env.BENCH_PARENT_GIT_DIR

test('materialization creates ten model-visible snapshots with allowed-path manifests', { skip: !gitDir }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bench-materialize-test-'))
  try {
    await materializeBenchmarks({ repoRoot: root, gitDir, outputRoot: 'benchmarks' })
    for (const id of TASK_IDS) {
      const manifest = JSON.parse(await readFile(path.join(root, 'benchmarks', 'tasks', id, 'snapshot', 'manifest.json'), 'utf8'))
      assert.equal(manifest.id, id)
      assert.deepEqual(manifest.allowedPaths, [manifest.targetPath])
      assert.equal(manifest.files.some((file) => file.path.includes('recipe')), false)
      assert.equal(JSON.stringify(manifest).includes('referenceRepair'), false)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('every evaluator mutation has an exact seeded preimage and known command', async () => {
  for (const id of TASK_IDS) {
    const recipe = recipeFor(id)
    assert.notEqual(recipe.from, recipe.to)
    assert.equal(recipe.command.argv.length > 0, true)
    assert.ok(recipe.command.cwd === '.' || recipe.command.cwd === 'platform')
  }
})

test('campaign parser rejects unknown taxonomy rather than inventing pass evidence', async () => {
  const { validateTrialRecord } = await import('../../scripts/bench-campaign.mjs')
  const base = { schemaVersion: 1, task: 'B01', accepted: false, failure: { primary: 'unknown' } }
  assert.throws(() => validateTrialRecord(base), /failure category/)
})

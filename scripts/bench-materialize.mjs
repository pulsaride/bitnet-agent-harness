#!/usr/bin/env node
import path from 'node:path'
import { materializeBenchmarks } from './bench-lib.mjs'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
const gitDir = process.env.BENCH_PARENT_GIT_DIR
if (!gitDir) throw new Error('BENCH_PARENT_GIT_DIR is required for private-source benchmark materialization')
await materializeBenchmarks({ repoRoot, gitDir, outputRoot: 'benchmarks' })
process.stdout.write(`${JSON.stringify({ ok: true, output: 'benchmarks', source: 'parent-git-read-only' })}\n`)

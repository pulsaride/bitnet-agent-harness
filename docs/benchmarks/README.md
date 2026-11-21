# Crash-resumable benchmarks

The benchmark tooling packages ten seeded maintenance tasks from reproducible inputs. Candidate snapshots are model-visible; qualification and evaluator material are kept outside those snapshots and are excluded from the npm package.

## Safety boundaries

- `benchmarks/tasks/<id>/snapshot` is model-visible and contains only declared source, visible tests, resources, prompt, hashes, allowed paths, command, and frozen budgets.
- `benchmarks/evaluator/recipes` is evaluator-only and must not be copied into a model workspace.
- Benchmark source is read from a pinned Git object database; the source working tree is not modified.
- Qualification and trials require `BENCH_CAPPED_PATH` with an explicit `8G` memory budget and four jobs.
- Runs do not use Ollama, remote inference, an external model, or evaluator material sent to a model endpoint.

## Qualification

1. Regenerate fixtures with `scripts/bench-materialize.mjs`.
2. Verify snapshot/evaluator separation with `scripts/bench-verify.mjs`.
3. Run `scripts/bench-qualify.mjs`. Each task must prove: clean pass, seeded fail, approved repair pass, and identical clean/repaired trees.

Qualification records are appended to `artifacts/benchmarks/qualification.jsonl`; the latest full report is `qualification.json`.

## Campaign resume

Run `scripts/bench-campaign.mjs` with the resource wrapper configured through `BENCH_CAPPED_PATH`. The baseline condition is the independent bounded BitNet action loop, not Pi (Pi is not integrated). The script writes one trial record at a time, fsync-free atomically replaces the checkpoint, and resumes from `nextIndex` after interruption.

A valid pass is never inferred from model output. The current runner deliberately records `accepted: false` when it lacks the separate evaluator/test-tool proof, so infrastructure or harness failures remain in the denominator.

## Frozen budgets

Each trial allows 12 model calls, 40 tool calls, 900 seconds, one schema-repair retry, 4096 context tokens, and 256 output tokens. Qualification and dependency preparation are outside inference wall time.

## Failure taxonomy

`environment`, `transport`, `context_overflow`, `format`, `selection`, `retrieval`, `edit`, `reasoning`, `verification`, `policy_denial`, `security_violation`, `budget`, and `harness_defect`.

Records retain one primary cause, contributors, first failing step, hashes, and nullable telemetry with a reason. Missing measurements are never represented as zero.

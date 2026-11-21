# Seeded coding benchmark specification

The benchmark exercises ten isolated maintenance tasks for the bounded action loop. The public specification defines the task format and measurement rules without publishing task-generation inputs or evaluator-only material.

## Public task format

Each task package contains:

- an isolated model-visible source snapshot;
- visible tests and required non-secret resources;
- a user-facing repair request;
- an allowed edit-path declaration;
- pinned execution budgets;
- a command for available verification;
- hashes identifying the task inputs.

Tasks B01–B10 cover deterministic regressions in a small Rust and Python codebase. The candidate prompt describes the expected behavior, while answer-bearing verification material remains separate from the model workspace. Candidate tasks must not include solution generation instructions, answer-bearing version history, or non-public tests.

The suite is intentionally narrow. It does not measure feature creation, large refactoring, or broad software-engineering competence. Several tasks share source areas, so repeated observations are not independent task classes.

## Qualification

Before a task is frozen, qualification must establish that:

1. the unmodified source passes its baseline checks;
2. the seeded fault is exposed by the intended verification;
3. the approved repair passes the relevant checks;
4. unrelated checks remain successful;
5. the candidate workspace contains only declared model-visible files.

Task inputs, prompts, dependencies, and evaluator identities are hashed. Qualification and dependency preparation are recorded separately from inference time.

## Execution and acceptance

A candidate run is bounded by explicit model-call, tool-call, wall-time, context, output, and retry limits. The evaluator uses a sanitized environment and the same resource envelope for every measured condition.

Acceptance requires independent test evidence from a clean evaluator workspace, with no unauthorized file changes, test weakening, manual repair, or prohibited side effects. Model output and exit text alone do not establish success. Policy refusal is recorded as non-completion and remains in the denominator.

Frozen configuration records identify the model, harness, dependency set, hardware, runtime image, resource limits, feature flags, ordering seed, and repetition. Ten tasks with three repetitions produce 30 observations per condition, not 30 independent task classes.

## Recorded measurements

Where available, each result records:

- task and artifact hashes;
- model, harness, dependency, and image identities;
- hardware and operating-system details;
- context and output budgets;
- condition, feature flags, repetition, and ordering seed;
- model and tool call counts;
- token, timing, and peak-memory measurements;
- retries and interventions;
- accepted status and failure categories;
- trace and diff hashes.

Unavailable telemetry is represented as `null` with a reason, not as an invented zero.

## Failure taxonomy

Primary categories are `environment`, `transport`, `context_overflow`, `format`, `selection`, `retrieval`, `edit`, `reasoning`, `verification`, `policy_denial`, `security_violation`, `budget`, and `harness_defect`. A result retains one primary category, contributing causes, and the first failing step.

Reports must retain failed trials, including infrastructure failures, and distinguish end-to-end acceptance rates from separately labeled evaluable-task rates.

# BitNet Agent Harness

BitNet Agent Harness is an experimental CPU-first TypeScript harness for local language-model inference and bounded tool execution.

**Status:** Early development · Experimental · Not production-ready

Repository: [pulsaride/bitnet-agent-harness](https://github.com/pulsaride/bitnet-agent-harness)

## Overview

The repository contains a local BitNet runtime, an OpenAI-compatible model client, policy-brokered workspace tools, skill discovery, deterministic workflows, a bounded action loop, a CLI, and benchmark tooling. It is intended for testing whether limited local models can be used safely with explicit execution constraints.

Current results demonstrate selected runtime and harness behaviors only. They do not establish general coding-agent capability, production readiness, portability, or performance parity with other systems.

## Implemented and planned scope

| Area | Current status |
|---|---|
| CPU runtime | Docker build and Compose profile with pinned model metadata |
| Model client | Chat, streaming, usage, and model discovery over a local OpenAI-compatible endpoint |
| Tools and policy | Experimental workspace and Git capabilities behind policy checks |
| Skills | Discovery of `SKILL.md` files from approved roots |
| Workflows | Minimal deterministic tool-step runner |
| CLI | Experimental `skills list`, `chat`, `run`, and `status` commands |
| Benchmarks | Local seeded-task qualification and campaign tooling |
| MCP, approvals, recovery | Not implemented as production capabilities |

## Architecture

The diagram is a high-level component map. Components are described as implemented or planned in the status table and sections below.

```text
Applications
└── Developer CLI / library experiments
    └── Agent harness
        ├── bounded action loop
        ├── policy broker
        ├── capability registry
        ├── workflow runner
        ├── tools
        └── skills
            └── OpenAI-compatible model client
                └── local BitNet runtime
```

## Current Implementation

The repository currently contains an experimental implementation, not a production-ready agent platform:

- a pinned CPU Docker build and Compose profile for Microsoft BitNet;
- explicit model preparation and checksum verification;
- health, streaming, non-streaming and context-overflow probes;
- an OpenAI-compatible TypeScript model client;
- a bounded action-envelope loop with broker-mediated tool execution;
- workspace read/list/search/edit capabilities and a Git diff capability;
- deterministic tool schemas, policy checks and JSONL run traces;
- skill discovery for approved roots;
- a minimal deterministic workflow runner;
- a CLI exposing `skills list`, `chat`, `run` and `status`;
- unit, security, contract and workflow tests;
- recorded runtime and capability probe artifacts.

The Pi assessment remains separate and unintegrated because its required immutable package path and broker-backed tool replacement were not available. MCP, approval UX, checkpoint rollback, resumable sessions, model routing and a sandboxed test/process SDK are not implemented as production capabilities. The benchmark campaign tooling completed its first one-trial pass but did not produce accepted repairs; see the evidence summary below. The current `MinimalActionLoop` must not be interpreted as evidence that the selected BitNet model is reliably agentic: capability probes include failures and malformed action output.

## Core Components

### 1. BitNet Inference Runtime

The CPU runtime targets reproducible BitNet inference through upstream `llama-server`. The current repository includes pinned source/model metadata, a Dockerfile, Compose profile and runtime scripts. The model is mounted separately from the image and verified before startup. No Ollama dependency or implicit external fallback is used.

Target and experimental properties include streaming where supported, configurable resource bounds, persistent model storage, artifact verification and inference telemetry.

Runtime commands and constraints are documented in [the installation guide](docs/runtime/install.md) and [the runtime guide](docs/runtime/run.md). A successful local runtime probe is evidence for one machine and configuration, not portability, benchmark completion or production readiness.

### 2. Agent Harness

The current harness converts model proposals into allowed tool calls rather than granting model output direct authority. Implemented execution includes a bounded loop, policy broker, workspace boundary, action allowlists, tool tracing and an independent session/event store.

Research areas include dynamic tool selection, context budgeting, repository intelligence, error recovery, compact state and deterministic verification. These areas are not all implemented yet.

### 3. Developer CLI

`bith` is the preferred CLI name. `bitnet-harness` remains available as a transitional compatibility alias.

Currently implemented commands:

```bash
bith skills list
bith chat "Explain this repository"
bith run "Analyze this repository"
bith status
```

Options currently used by the implementation are `--json`, `--workspace PATH`, `--root PATH`, `--skills PATH` and `--endpoint URL`. The direct executable can also be run with Node:

```bash
node --experimental-strip-types bin/bith.mjs skills list
```

`chat` sends one prompt to the local endpoint. `run` invokes the bounded loop and grants only the registered workspace/Git capabilities. The CLI is non-interactive and does not currently provide `doctor`, `tools list`, `bench`, installation, update, checkpoint or approval commands.

### 4. Tools SDK

Registered tools currently support bounded workspace reading, listing and searching, exact workspace edits, test execution in the test tooling layer, and Git diff inspection. Tools expose typed descriptors and pass through policy checks. MCP integration, OS-level subprocess sandboxing and a general external connector SDK remain future work.

Tools are designed to be executable and testable without requiring a language model. Model output, skill text and tool annotations do not grant permissions.

### 5. Skills SDK

Skills follow the `SKILL.md` convention and are discovered from explicit approved roots. The current loader exposes deterministic summaries and validates basic package structure. Example skills in this repository cover repository analysis, code review, unit-test generation and failing-test workflows.

```text
examples/skills/
├── repository-analysis/SKILL.md
├── code-review/SKILL.md
├── generate-unit-tests/SKILL.md
└── fix-failing-tests/SKILL.md
```

Only explicitly approved skill roots are loaded. Activation, installation, reference budgeting, script execution and provenance locks are not yet a complete product workflow.

### 6. Workflow Engine

The minimal workflow runner executes declared deterministic tool steps and records a JSONL trace. It rejects duplicate step IDs, unsupported step kinds and oversized workflows. Current workflows do not provide a complete model-step planner, approval protocol, resumable checkpoint journal, crash recovery or cross-file atomicity.

## Research Areas

| Research area | Objective |
|---|---|
| Harness engineering | Improve agent performance without increasing model size |
| Context engineering | Maximize useful information within limited context windows |
| Structured generation | Improve schema-valid action proposals |
| Dynamic tool selection | Reduce tool confusion and prompt overhead |
| Skill engineering | Load specialized procedures progressively |
| Repository intelligence | Retrieve relevant code and evidence efficiently |
| Deterministic workflows | Reduce unnecessary model decisions |
| Error recovery | Recover from bounded invalid actions and failed execution |
| CPU inference | Measure performance on commodity hardware |
| Agent security | Enforce permissions and execution boundaries |
| Inference economics | Measure resource cost per verified task |

## Experimental Methodology

The planned comparisons isolate harness contributions while holding model, hardware, runtime, task and safety conditions fixed where possible. Candidate conditions include raw BitNet inference, a conventional harness, an optimized harness, and an optimized harness with skills and workflows.

Benchmark evidence must separate runtime protocol behavior from model behavior. The existing artifacts show some runtime capabilities passing while native tool calls are unsupported and several model-behavior checks fail. These probe results are not a completed coding-agent benchmark.

### Candidate inference metrics

- Time to first token.
- Prompt throughput.
- Generation throughput.
- Peak memory and CPU use.
- Practical context capacity.

### Candidate agent metrics

- Verified task success rate.
- Schema-valid and correctly selected tool calls.
- Required human intervention.
- Execution steps and bounded retries.
- Recovery rate.
- Security violations.
- Resource cost per verified success.

No performance parity with frontier cloud models is claimed. The [ten-task specification](docs/benchmark-tasks.md) and local materialization are implemented. The first crash-resumable campaign completed one repetition of each task and recorded `0/10` accepted repairs. None reached an external task evaluator; the records classify the observed outcomes as verification failures because the runner requires independent test evidence before accepting completion.

## Getting Started

### Requirements

- Node.js 22.19 or newer for the TypeScript/CLI workflow.
- npm for dependencies and package metadata.
- Docker, an AVX2 x86_64 Linux host and sufficient disk space for the CPU runtime.

### Install and test the TypeScript project

```bash
npm ci
npm test
npm run typecheck
```

Link both local CLI names when desired:

```bash
npm link
bith skills list
bitnet-harness status --json
```

Both commands resolve to the same executable. The shorter `bith` name is preferred for new usage; `bitnet-harness` remains the transitional alias.

### Prepare and run the CPU runtime

Model preparation is an explicit network operation:

```bash
scripts/runtime-prepare-model.sh
scripts/runtime-verify-model.sh
scripts/runtime-run.sh
```

Then probe the running service:

```bash
curl -fsS http://127.0.0.1:15842/health
curl -fsS http://127.0.0.1:15842/v1/models
scripts/runtime-probe.mjs
scripts/runtime-probe.mjs --stream
node scripts/runtime-context-probe.mjs
```

The service binds to `127.0.0.1:15842` and does not download a model at container startup. Stop it with:

```bash
docker compose -f deploy/compose/compose.cpu.yml down
```

### Exercise the CLI

```bash
bith skills list --root examples/skills
bith status --endpoint http://127.0.0.1:15842 --json
bith chat "Reply briefly" --endpoint http://127.0.0.1:15842 --json
bith run "Inspect this workspace" --workspace . --skills examples/skills --endpoint http://127.0.0.1:15842 --json
```

CLI `run` requires a sufficiently capable endpoint and currently fails safely when the model cannot produce an allowed action envelope. It is not a promise that the 2B BitNet model can complete arbitrary coding tasks.

## Security

Security is foundational, but the experimental implementation is not a sandbox or production security boundary.

The project follows these principles:

- No mandatory cloud inference.
- No implicit external model fallback.
- Explicit workspace scope and capability registration.
- Model proposals pass through policy checks.
- Network access remains off the default tool path.
- Model, repository, skill and tool responses are untrusted input.
- Pinned artifacts and verifiable hashes where implemented.
- Local execution traces with bounded/error-safe behavior.

Important gaps remain: Pi's trusted host tools are not integrated, current process execution is not a complete OS sandbox, approval UX is incomplete, and MCP is not implemented. Review [SECURITY.md](SECURITY.md) before deploying or extending the project.

## Use Cases

The first target is local developer assistance:

- repository exploration;
- code and repository explanation;
- deterministic file inspection and bounded editing;
- test generation and diagnosis experiments;
- code review assistance;
- skill-driven development workflows.

Longer-term targets include extensible local agents, IDE integration and specialized domain workflows. Reliability for these use cases remains to be measured; the current BitNet capability evidence is limited.

## Roadmap

The roadmap records intended work, not completed functionality.

| Area | Current status |
|---|---|
| Architecture and technical specifications | Initial design documented |
| BitNet CPU Docker runtime | Implemented and locally probed; portability unproven |
| OpenAI-compatible model client | Implemented for chat, streaming, usage and model discovery |
| Tools, policy and traces | Experimental subset implemented |
| Skills discovery | Experimental parser/discovery implemented |
| Bounded action loop | Experimental; live model action-envelope checks include failures |
| Pi integration | Assessed but blocked; not integrated |
| Developer CLI | Four experimental commands implemented |
| Structured workflows | Minimal deterministic runner implemented |
| Coding-task benchmark | Ten local tasks qualified; one first-repetition campaign completed with 0/10 accepted |
| MCP, IDEs and embeddable SDK | Planned |
| Production sandbox, approvals and recovery | Planned |

See [the benchmark specification](docs/benchmark-tasks.md), [runtime documents](docs/runtime/) and [capability contracts](docs/capability-contracts.md) for detail and caveats. Qualification completed for all ten tasks; the first crash-resumed campaign completed B01–B10 with no accepted repairs. Its mixed pre/post-port-migration conditions and lack of external evaluator execution are documented in [the initial benchmark note](docs/experiments/initial-benchmark.md).

## Related Projects

This initiative evaluates ideas and components from the open-source ecosystem, including Microsoft BitNet and bitnet.cpp, Pi Coding Agent, llama.cpp, Goose, OpenCode, Aider, OpenHands, Agent Skills and the Model Context Protocol. Evaluation does not imply integration or endorsement.

## Contributing

Contributions are welcome for low-bit models, CPU inference, agent and harness architecture, context engineering, developer tooling, skills, tools, benchmarks, security and documentation. Reproducible negative results are valuable.

Read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md) before contributing. For security reports, do not open a public issue with exploit details.

## Project Status and License

BitNet Agent Harness is an independent experimental open-source project. It is not affiliated with, sponsored by, or endorsed by Microsoft.

The project source is licensed under the [Apache License 2.0](LICENSE). Third-party dependencies, upstream BitNet code, model weights and model artifacts retain their own licenses and usage terms.

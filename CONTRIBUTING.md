# Contributing to BitNet Agent Harness

Thank you for contributing. The project is experimental, so reproducible evidence and clear limitations matter more than optimistic claims.

## Before contributing

- Read the [Code of Conduct](CODE_OF_CONDUCT.md) and [security policy](SECURITY.md).
- Search existing issues and pull requests before starting overlapping work.
- Keep model, runtime, policy and benchmark changes separate when possible.
- Do not submit secrets, model weights, private source, benchmark oracles, or generated runtime caches.

## Development setup

Use Node.js 22.19 or newer:

```bash
npm ci
npm test
npm run typecheck
```

The CLI can be exercised directly:

```bash
node --experimental-strip-types bin/bith.mjs skills list --root examples/skills
node --experimental-strip-types bin/bith.mjs status --json
```

Install both local CLI names with `npm link` if needed. `bith` is the preferred name; `bitnet-harness` remains a transitional alias.

## Runtime work

Model preparation performs a network download and must be explicit:

```bash
scripts/runtime-prepare-model.sh
scripts/runtime-verify-model.sh
scripts/runtime-run.sh
scripts/runtime-probe.mjs
```

Follow [the runtime installation guide](docs/runtime/install.md) and [the runtime guide](docs/runtime/run.md). Do not assume a successful local probe proves reproducibility, portability, benchmark performance, or production readiness.

## Change expectations

- Add or update tests for behavior changes; keep deterministic tests independent of a live model where possible.
- Preserve fail-closed policy and explicit workspace boundaries.
- Validate user input and do not grant permissions from model output, skill content, or tool annotations.
- Describe incomplete experiments and failed probes truthfully.
- Update documentation when commands, interfaces, status, or limitations change.
- Keep generated artifacts and evidence attributable to a specific command, configuration, and date.

## Pull requests

A pull request should include:

1. The problem and scope.
2. The implementation approach and security implications.
3. Tests run, with the relevant output summarized.
4. Benchmark evidence only when the prescribed experiment was actually run; otherwise state that no benchmark was performed.
5. Documentation updates for user-visible behavior.
6. Links to related issues or design documents.

Small, reviewable changes are preferred. Do not commit unrelated formatting or artifact churn.

## Contributor license

By submitting a contribution, you agree that it is licensed under the repository's [Apache License 2.0](LICENSE), unless a separate written agreement is explicitly agreed with the maintainers.

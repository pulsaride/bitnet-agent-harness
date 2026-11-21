# Pi integration assessment

## Package identity

The assessed package is `@earendil-works/pi-coding-agent` 1.6.0. Package identity and archive integrity values are recorded in `config/pi/provenance.json`. The runtime requires Node.js 22.19 or newer.

The deprecated `@mariozechner/pi-coding-agent` package is not an active fallback or compatibility target.

No package is installed into the workspace or an ambient user catalog. `config/pi/security.json` disables catalog and package installation, credentials, ambient project discovery, fallback inference, and built-in execution. The only configured inference endpoint is `http://127.0.0.1:15842`.

## Skills

Pi runtime skill roots are not loaded implicitly. A root must be explicitly approved before discovery, and skill scripts require separate registration, policy checks, and sandboxed execution.

## Result

Pi was not integrated or launched. A secure adapter requires an immutable local package module and dependency closure plus broker-backed replacements for Pi's normal host-authority tools. Installation is disabled for the assessed condition, and Pi host tools and extensions are trusted executable code rather than a sandbox. The adapter therefore records a fail-closed integration result.

The probe records package identity, endpoint restrictions, capability assumptions, and the failure reason. Interactive and non-interactive Pi chat, sessions, repository discovery, file tools, execution, and skill activation remain unvalidated.

The adapter verifies pinned SHA-256 values for `package.json` and `dist/index.js` before importing executable code. A substituted or modified package fails closed before import.

## Separately named alternative

`MinimalActionLoop` is an independent bounded action-envelope loop, not a Pi integration. Model text may create a proposal only. Every allowed proposal crosses an external broker boundary; no proposal authorizes execution. Tests establish that unknown actions are rejected, denied proposals do not execute, and approved model claims are not automatically trusted.

Repository exploration, file reading, process execution, and skill operations are capability names only unless an external broker implements and authorizes them. The loop keeps a bounded in-memory session transcript, uses system instructions through the model port, and has no fallback provider.

## Reproduction

```bash
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext src/runtime/pi-adapter.ts src/runtime/minimal-loop.ts
node --experimental-strip-types --test tests/pi/minimal-loop.test.mjs
node --experimental-strip-types scripts/pi-probe.mjs
```

The model probe writes `artifacts/pi/provenance.json`, `report.json` and `trace.jsonl`. A failed Pi availability check is evidence, not a fallback condition.

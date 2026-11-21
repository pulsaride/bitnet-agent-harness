# Capability contracts v0.1 — experimental subset implemented

Stable records are versioned JSON. An experimental subset exists in `src/capabilities`, `src/policy`, `src/skills`, `src/tools`, `src/sessions`, and `src/workflows`; the examples and broader contracts below remain proposed where explicitly noted. No terminal- or model-specific types enter the SDK.

Implementation status: descriptor and registry validation, policy-broker execution, skill discovery, bounded file/Git/test tooling, JSONL sessions, and a minimal deterministic workflow runner are covered by tests. Process isolation, MCP, installation and provenance workflows, approvals, checkpoints, resume/rollback, and the full CLI surface are not complete. Contract examples are not all existing code.

## Common semantics

UTF-8 JSON, protocol version `1`, qualified IDs `namespace/name`, exact semantic versions plus SHA-256 content digest. Registries sort by ID/version/digest and reject duplicates; no silent replacement or implicit network resolution. JSON Schema draft 2020-12 is the validation dialect; provider adapters must reject unsupported schema subsets rather than silently weaken them. Compatibility negotiation rejects unknown major versions. Runtime budgets/policy may tighten declarations, never broaden them.

```text
ModelPort.describe() -> ModelCapabilities
ModelPort.generate(request, cancellation) -> AsyncStream<ModelEvent>
Registry.list(kind) -> CapabilityDescriptor[]
Registry.resolve(id, version, digest) -> CapabilityDescriptor
Policy.decide(call, userIntent, workspaceSnapshot) -> Allow | Ask | Deny
Executor.execute(approvedCall, cancellation) -> ToolResult
SkillLoader.discover(approvedRoots) -> SkillSummary[]
SkillLoader.activate(skillRef, contextBudget) -> SkillContent
WorkflowRunner.start(workflowRef, inputs, budget) -> RunId
Session.resume(runId, expectedWorkspaceDigest) -> RunState
```

`ModelCapabilities` records artifact identity, measured context limit, streaming/tool/schema support as `verified | unsupported | unknown` with probe IDs. Requests reserve output and template tokens. No provider fallback; unknown required capability fails before execution. Cancellation reaches HTTP requests and child process groups. Provider text cannot authorize execution.

## Tool registration and execution

```json
{
  "protocolVersion": 1,
  "id": "workspace/read",
  "version": "0.1.0",
  "description": "Read a bounded UTF-8 file range inside the workspace",
  "inputSchema": {
    "type": "object",
    "properties": {"path": {"type": "string", "minLength": 1}, "offset": {"type": "integer", "minimum": 0}, "limit": {"type": "integer", "minimum": 1, "maximum": 65536}},
    "required": ["path", "offset", "limit"],
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "properties": {"text": {"type": "string"}, "sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"}, "truncated": {"type": "boolean"}},
    "required": ["text", "sha256", "truncated"],
    "additionalProperties": false
  },
  "permissions": {"read": ["workspace"], "write": [], "network": [], "process": false},
  "limits": {"timeoutMs": 5000, "maxOutputBytes": 65536},
  "implementation": {"kind": "native", "entry": "workspace.read"}
}
```

The package manifest supplies the descriptor digest; hashing excludes its own digest field. Native handlers are pretrusted registered functions, never arbitrary paths supplied by the model. A subprocess implementation specifies a pinned executable and argv template, isolated cwd and environment allowlist, with JSON stdin/stdout. An MCP implementation names a pinned server, transport, server tool and declared permissions; use an established MCP library and negotiate protocol. Both still pass through the same broker.

Discovery never executes package scripts. MCP `tools/list` pagination and schema changes are normalized; changed definitions require revalidation. Remote MCP is off by default. MCP annotations are hints, not authorization. [MCP tool schemas](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) are adapted to the validated result envelope.

Execution sequence: resolve pinned definition → validate input → compute concrete effects → policy/approval → recheck workspace preconditions → execute with enforced bounds → validate output → redact/cap → append event → return result. Output capping must retain valid JSON and a `truncated` flag; never truncate serialized JSON bytes arbitrarily. Overflow artifacts are local, bounded and not automatically sent to the model.

`ToolResult = {callId, status, output?, error?, truncated, durationMs, artifactRefs}`. Status is `ok | denied | invalid_input | invalid_output | timeout | cancelled | execution_error | stale_precondition`. Errors carry stable code and safe message; internal stack traces stay outside context. Missing/invalid output never counts as success. Runtime trace IDs and timestamps are observational; deterministic artifact hashes exclude them.

Approval binds run/call ID, normalized arguments, capability digest, resolved paths, command argv, workspace base hashes and policy version. Edits after approval invalidate it. Noninteractive mode with no matching grant returns `approval_required`, never auto-accepts. Cancellation/timeout kills descendants and records whether external effects may have occurred; uncertain writes are not blindly retried.

## Filesystem, editing and process boundaries

Workspace is an explicit root, not inferred from cwd ancestry. Deny traversal, symlink escape, special files and credential paths. Resolve paths safely at open time to avoid symlink races. Child processes have only declared mounts, no inherited secrets, host sockets, network or Docker daemon access. Command allowlists alone are insufficient: tests can execute arbitrary repository code, so test execution is sandboxed too. Native in-process plugins are trusted code; untrusted plugins use subprocess isolation.

`workspace/edit` takes `path`, `baseSha256`, and exact replacement ranges or unique old/new text. Reject mismatched hashes, overlapping ranges, ambiguous matches and oversized patches. Stage and validate every file before mutation; journal multi-file application and recover/restore if interrupted. Do not claim cross-file filesystem atomicity. Preserve existing unrelated changes. `git/diff` includes new files in its review inventory. Checkpoints contain tracked and untracked allowed files, content hashes and exclusions; rollback restores only run-owned changes after checking intervening edits. No `git reset --hard` against the user's worktree.

Initial capabilities: `workspace/list`, `workspace/read`, `workspace/search`, `workspace/edit`, `process/test`, `git/diff`; custom demo `project/count-files` reads only allowed workspace entries. Shell is not required for general model access; test commands use explicit argv and a sandbox profile.

## Skills

Adopt [Agent Skills](https://agentskills.io/specification): `SKILL.md` with required name/description, optional metadata/compatibility/license, and optional references/scripts/assets. Validate names and length constraints using the standard. Store version in `metadata.version` and digest in the installation lock; do not invent a required incompatible frontmatter field.

Discovery scans explicit approved roots in deterministic order without following escaping symlinks. A duplicate name requires an explicit pinned selection. Initially expose only name, description, version/digest and origin; activation loads the body within the context budget; references load on demand. Invalid frontmatter, oversized bodies or missing resources produce visible errors.

Explicit user activation wins; model suggestions select only discovered compatible skills. A skill's `allowed-tools` is a restriction/hint, never a grant. Scripts need separate tool registration, policy and sandbox execution. Installation from a local directory validates and copies into a versioned store; network installation needs explicit approval, pinned source and digest. Do not execute postinstall hooks. Track activated version, references and selection reason per run. Demo skill: `review-small-diff`, with one reference and a deterministic checklist; no executable code needed.

## Workflows

```yaml
protocolVersion: 1
id: coding/fix-failing-test
version: 0.1.0
inputs: {task: string, testProfile: string}
budget: {maxModelCalls: 12, maxToolCalls: 40, maxWallSeconds: 900}
steps:
  - {id: inspect, kind: tool, capability: workspace/list}
  - {id: propose, kind: model, outputSchema: action-v1, maxRetries: 1}
  - {id: apply, kind: tool, capability: workspace/edit, checkpoint: before}
  - {id: verify, kind: tool, capability: process/test, maxRetries: 0}
acceptance: {all: [testExitZero, allowedFilesOnly, evaluatorPass]}
```

This example is structural: actual manifests must pin each capability and supply validated step inputs/references before execution. Reject unknown steps, missing references, cycles, unbounded loops and unsupported schemas. Model steps choose only actions allowed at that node; deterministic steps do not call a model. Retry count means additional attempts, consumes the global budget and retries only declared safe failures. Default no retry for side effects. Failure transitions are explicit and bounded.

States: `created → running → waiting_approval | checkpointed | failed | cancelled | succeeded`. Resume verifies workflow/capability digests, workspace hashes and completed-effect journal. Never replay a completed write automatically. Acceptance is an evaluator predicate over test exit status, diff scope and immutable checks, not the model saying “done.”

## Sessions and external interface

JSONL events: `{protocolVersion, runId, sequence, type, payload}`; monotonic sequence per run, recovery ignores a truncated final record after reporting it. Types include model-start/end, tool-proposed/approved/result, skill-activated, checkpoint, validation and run-finished. Raw prompts/results are opt-in, local and bounded; benchmark fixtures may enable controlled trace retention. Secrets are excluded from prompts and redacted in errors.

CLI adapters expose chat, run, models, skills list/install, tools inspect, workflow run, sessions resume, approvals, diff, checkpoint/rollback and benchmark. This sentence defines a proposed eventual surface: the current CLI implements only `skills list`, `chat`, `run` and `status`. `--json` uses the shared response/event intent; any later RPC layer maps these ports without embedding terminal logic.

## Contract acceptance tests

Implemented tests cover registry validation, schema failures, poisoned-skill authority denial, traversal/symlink escape, stale and ambiguous edits, policy pin binding, action-envelope denial, tracing/output limits and workflow completion checks. Tests for OS process isolation, MCP, approval argument substitution, crash-safe journals and resume-without-write-replay remain to implement.

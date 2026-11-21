# Milestone B capability measurement

Measured 2026-11-21 against the running loopback-only pinned BitNet `llama-server` at `127.0.0.1:15842`. No external inference, GPU, Ollama, or fallback provider was used.

## Scope and interpretation

Runtime capability and model behavior are separate results:

- **Runtime capability** tests the accepted HTTP/SSE request shape, response wire fields, usage, JSON Schema/grammar constraints, and native `tool_calls`.
- **Model behavior** tests conversational, instruction, coding, JSON, action-envelope, multi-turn, and correction behavior under fixed prompts and temperature 0.

A passing request or valid parser result does not establish OpenAI compatibility. The only compatibility claim is the specifically measured subset recorded in `artifacts/capability/report.json`.

## Typed client

`BitNetClient` implements the provider-neutral `ModelPort` with:

- non-streaming completion;
- incremental SSE streaming;
- caller cancellation and bounded timeout cancellation;
- prompt/completion/total usage mapping;
- native tool-call mapping when present;
- OpenAI-shaped request controls for tools, tool choice, response format, and llama.cpp grammar;
- bounded HTTP error details and no prompt execution.

Unit tests use mock fetch responses only; live probes use the local Milestone A runtime.

## Measured results

- Runtime: **3/5** passed.
- Verified: streaming SSE, JSON Schema-constrained decoding, GBNF grammar-constrained decoding, and usage on successful completions.
- `json_object` was accepted as a request field but failed to produce parseable JSON in this trial, so it is not claimed as supported.
- Native OpenAI-style `tool_calls` did not occur. The server's template advertises no tool support, and the response remained text.
- Model behavior: **1/8** passed. The multi-turn probe retained the literal token `ORCHID`, but output format still degraded into repetition. No conversational, instruction-only, code, JSON, action-envelope, or correction trial met its strict criterion.

The action-envelope adapter is deliberately separate from native tool calls. It validates JSON and an allowlist only; malformed JSON never executes. Parsing is not authorization or execution.

## Limitations

The server applied `max_tokens` correctly after probe correction, but the model often exhausted the token budget by repetition and echoing the prompt. Results are one local measurement campaign, not broad quality or compatibility certification. The 4096-token context comes from `/props`; model JSON behavior without constraints is weak. JSON Schema and grammar are runtime constraints, not evidence of unconstrained model reasoning.

Cancellation is unit-tested without model inference. Live cancellation was not destructive-tested against the queue. Streaming usage was not emitted in the inspected stream; non-stream usage was measured. Raw prompts/responses are bounded to 12,000 characters and contain only controlled test data. Secrets are not supplied.

## Reproduction

```bash
node --experimental-strip-types --test tests/runtime/model-adapters.test.mjs
node scripts/capability-probe.mjs
```

The probe overwrites `artifacts/capability/report.json` and `trace.jsonl`. Every record includes the prompt, prompt hash, controls, raw bounded response, latency, retry count, token/timing telemetry, pass/failure assessment, and failure taxonomy.

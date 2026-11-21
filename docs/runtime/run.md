# Milestone A: run and probe

## Start

```bash
scripts/runtime-run.sh
docker compose -f deploy/compose/compose.cpu.yml ps
```

The service publishes `127.0.0.1:15842` only. It runs as UID/GID 10001 with a read-only root filesystem, no Linux capabilities, no new privileges, bounded PID/CPU/RAM resources, and no workspace mount. The only bind mount is the read-only, checksum-verified model file. Entrypoint startup rejects a missing or altered model before starting the process; it never downloads anything.

## Readiness and probes

The Docker health check uses upstream `/health`. Application readiness is stricter: run both endpoint discovery and a real completion before declaring the model ready.

```bash
curl -fsS http://127.0.0.1:15842/health
curl -fsS http://127.0.0.1:15842/v1/models
scripts/runtime-probe.mjs
scripts/runtime-probe.mjs --stream
node scripts/runtime-context-probe.mjs
```

The non-streaming probe records server usage, elapsed inference, first response, and approximate throughput. The streaming probe records SSE first-token arrival. Throughput reported there is approximate for fragmented SSE because upstream usage is not emitted on every compatible server; use `llama-server` timing fields and completed-token counts as primary evidence when available.

The context probe submits a prompt far beyond the model's 4096-token limit and expects rejection. It fails if the server accepts the request, preserving an explicit contract failure.

## Runtime evidence

```bash
docker inspect bitnet-bitnet-1
ID=$(docker compose -f deploy/compose/compose.cpu.yml ps -q bitnet)
docker stats --no-stream "$ID"
docker exec "$ID" sh -c 'cat /proc/1/status | grep -E "^(VmRSS|VmHWM|VmPeak):"'
```

Record `VmRSS`/`VmHWM` plus container peak statistics while a probe runs. CPU percentage from `docker stats` is host-view CPU across configured CPUs, so document the limit and sampling duration with each result.

## Stop

```bash
docker compose -f deploy/compose/compose.cpu.yml down
```

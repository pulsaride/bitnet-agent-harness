#!/usr/bin/env bash
set -euo pipefail
readonly repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash -n \
  "$repo_root/docker/cpu/entrypoint.sh" \
  "$repo_root/scripts/runtime-prepare-model.sh" \
  "$repo_root/scripts/runtime-verify-model.sh" \
  "$repo_root/scripts/runtime-checks.sh"
node --check "$repo_root/scripts/runtime-probe.mjs"
node --check "$repo_root/scripts/runtime-context-probe.mjs"
node -e 'const l=require(process.argv[1]); if(l.image.sourceRevision.length!==40||l.image.llamaCppRevision.length!==40||l.model.revision.length!==40) process.exit(1)' \
  "$repo_root/manifests/runtime.lock.json"
docker compose -f "$repo_root/deploy/compose/compose.cpu.yml" config >/dev/null
printf 'runtime static checks: PASS\n'

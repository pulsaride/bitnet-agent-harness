#!/usr/bin/env bash
set -euo pipefail
readonly repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly compose_file="$repo_root/deploy/compose/compose.cpu.yml"
readonly model="${MODEL_FILE:-$repo_root/docker/cpu/.cache/ggml-model-i2_s.gguf}"

"$repo_root/scripts/runtime-verify-model.sh" "$model" >/dev/null
export MODEL_FILE="$model"
export MODEL_SHA256="$(node -p 'require(process.argv[1]).model.sha256' "$repo_root/manifests/runtime.lock.json")"
docker compose -f "$compose_file" up -d --no-build "$@"

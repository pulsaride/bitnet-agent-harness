#!/usr/bin/env bash
set -euo pipefail

readonly repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly lock="$repo_root/manifests/runtime.lock.json"
readonly model="${1:-$repo_root/docker/cpu/.cache/ggml-model-i2_s.gguf}"
mapfile -t values < <(node -e '
  const l=require(process.argv[1]);
  process.stdout.write([l.model.filename,l.model.sizeBytes,l.model.sha256].join("\n")+"\n")
' "$lock")
readonly filename="${values[0]}" size="${values[1]}" sha256="${values[2]}"

[[ -f "$model" ]] || { echo "missing model: $model" >&2; exit 66; }
[[ "${model##*/}" == "$filename" ]] || { echo "unexpected model filename" >&2; exit 65; }
[[ "$sha256" != PENDING_DOWNLOAD_VERIFICATION ]] || { echo "manifest SHA-256 is pending" >&2; exit 65; }
actual_size="$(stat -c '%s' "$model")"
actual_sha256="$(sha256sum "$model" | awk '{print $1}')"
[[ "$actual_size" == "$size" && "$actual_sha256" == "$sha256" ]] || {
  echo "verification failed: expected size=$size sha256=$sha256; got size=$actual_size sha256=$actual_sha256" >&2
  exit 65
}
printf 'model=%s\nsize=%s\nsha256=%s\n' "$model" "$actual_size" "$actual_sha256"

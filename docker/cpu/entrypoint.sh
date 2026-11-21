#!/usr/bin/env bash
set -euo pipefail

readonly model_path="${MODEL_PATH:-/models/ggml-model-i2_s.gguf}"
readonly expected_sha256="${MODEL_SHA256:?MODEL_SHA256 is required}"
readonly threads="${BITNET_THREADS:-8}"
readonly context="${BITNET_CONTEXT:-4096}"
readonly max_predict="${BITNET_MAX_PREDICT:-256}"

if [[ ! -r "$model_path" ]]; then
  echo "model is not mounted or is not readable: $model_path" >&2
  exit 64
fi

actual_sha256="$(sha256sum "$model_path" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  echo "model checksum mismatch: expected $expected_sha256, got $actual_sha256" >&2
  exit 65
fi

if [[ ! "$threads" =~ ^[1-9][0-9]*$ || ! "$context" =~ ^[1-9][0-9]*$ || ! "$max_predict" =~ ^[1-9][0-9]*$ ]]; then
  echo "runtime limits must be positive integers" >&2
  exit 64
fi

exec /opt/bitnet/bin/llama-server \
  -m "$model_path" \
  -c "$context" \
  -t "$threads" \
  -n "$max_predict" \
  -ngl 0 \
  --host 0.0.0.0 \
  --port 15842 \
  --temp "${BITNET_TEMPERATURE:-0.8}" \
  -cb

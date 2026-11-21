#!/usr/bin/env bash
set -euo pipefail

readonly repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly lock="$repo_root/manifests/runtime.lock.json"
readonly default_dir="$repo_root/docker/cpu/.cache"
readonly output_dir="${1:-$default_dir}"

readarray -t values < <(node -e '
  const l=require(process.argv[1]);
  for (const k of [l.model.repository,l.model.revision,l.model.filename,l.model.sha256,l.model.sizeBytes]) console.log(k)
' "$lock")
readonly repository="${values[0]}"
readonly revision="${values[1]}"
readonly filename="${values[2]}"
readonly expected_sha256="${values[3]}"
readonly expected_size="${values[4]}"
readonly target="$output_dir/$filename"

if [[ "$revision" =~ [^0-9a-f] || ${#revision} -ne 40 ]]; then
  echo "model revision is not an immutable 40-character Git SHA" >&2
  exit 64
fi
if [[ "$expected_sha256" == PENDING_DOWNLOAD_VERIFICATION ]]; then
  echo "runtime lock has not received the independently verified model SHA-256" >&2
  exit 65
fi

mkdir -p "$output_dir"
temporary="$target.part"
trap 'rm -f "$temporary"' EXIT
url="https://huggingface.co/$repository/resolve/$revision/$filename?download=true"
echo "Downloading pinned $repository@$revision/$filename" >&2
curl --fail --location --retry 3 --retry-all-errors --output "$temporary" "$url"
actual_size="$(stat -c '%s' "$temporary")"
actual_sha256="$(sha256sum "$temporary" | awk '{print $1}')"
if [[ "$actual_size" != "$expected_size" || "$actual_sha256" != "$expected_sha256" ]]; then
  echo "artifact verification failed: size=$actual_size sha256=$actual_sha256" >&2
  exit 65
fi
mv "$temporary" "$target"
chmod 0444 "$target"
echo "$target"

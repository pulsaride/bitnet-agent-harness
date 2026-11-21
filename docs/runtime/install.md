# Milestone A: install and reproduce

Milestone A supports x86_64 Linux with AVX2 and a Docker daemon. It uses Microsoft BitNet at immutable commit `0b341e582afbf9e1011f24744b554c96a3477eb5`, recursive llama.cpp commit `390c307752ab78fd8189f359d6954c9ba1be74af`, and Ubuntu `24.04` pinned by digest. The pinned model and every build/runtime pin are in `manifests/runtime.lock.json`.

## One-time build preparation

Confirm available disk and Docker capacity first. Model preparation is an explicit network operation and never occurs at container startup:

```bash
scripts/runtime-prepare-model.sh
scripts/runtime-verify-model.sh
```

The first command downloads the exact model revision and verifies size and SHA-256 before moving it into `docker/cpu/.cache/`. To use a different cache, pass its directory as the first argument and export the resulting `MODEL_FILE` for Compose.

## Build

Build exactly once from the project root:

```bash
docker build \
  --platform linux/amd64 \
  --file docker/cpu/Dockerfile \
  --tag bitnet-cpu:milestone-a \
  .
```

Build-time inputs are fetched only from the pinned Git commit, pinned recursive submodule, and digest-pinned Ubuntu base. The Dockerfile verifies both Git SHAs and uses the upstream I2_S x86_64 configuration with GPU layers disabled.

## Validation

```bash
scripts/runtime-checks.sh
docker image inspect bitnet-cpu:milestone-a
```

No model, source checkout, workspace, home directory, Docker socket, or credential is copied into the image. The image contains the compiled BitNet server and runtime libraries only.

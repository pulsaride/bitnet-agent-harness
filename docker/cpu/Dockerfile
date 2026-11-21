# syntax=docker/dockerfile:1.7
FROM ubuntu@sha256:9c7f200c07e3d4a03e7249d2c16bf66a51120fb876aa2242cf31451412543289 AS build

ARG BITNET_REPOSITORY=https://github.com/microsoft/BitNet.git
ARG BITNET_REVISION=0b341e582afbf9e1011f24744b554c96a3477eb5
ARG LLAMA_CPP_REVISION=390c307752ab78fd8189f359d6954c9ba1be74af

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update -qq && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential=12.10ubuntu1 \
      ca-certificates=20260816ubuntu0.24.04.2 \
      clang=1:18.0-59~exp2 \
      cmake=3.28.3-1build7 \
      git=1:2.43.0-1ubuntu7.4 \
      python3=3.12.3-0ubuntu2.1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --no-checkout "$BITNET_REPOSITORY" BitNet && \
    cd BitNet && \
    git checkout --detach "$BITNET_REVISION" && \
    test "$(git rev-parse HEAD)" = "$BITNET_REVISION" && \
    git submodule update --init --recursive && \
    test "$(git -C 3rdparty/llama.cpp rev-parse HEAD)" = "$LLAMA_CPP_REVISION" && \
    python3 utils/codegen_tl2.py --model bitnet_b1_58-3B \
      --BM 160,320,320 --BK 96,96,96 --bm 32,32,32 && \
    cmake -B build \
      -DBITNET_X86_TL2=OFF \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_C_COMPILER=clang \
      -DCMAKE_CXX_COMPILER=clang++ \
      -DLLAMA_BUILD_TOOLS=ON \
      -DLLAMA_BUILD_EXAMPLES=OFF \
      -DLLAMA_BUILD_COMMON=ON \
      -DLLAMA_BUILD_SERVER=ON && \
    cmake --build build --config Release --target llama-server --parallel "$(nproc)" && \
    test -x build/bin/llama-server

FROM ubuntu@sha256:9c7f200c07e3d4a03e7249d2c16bf66a51120fb876aa2242cf31451412543289 AS runtime

LABEL org.opencontainers.image.title="bitnet-cpu" \
      org.opencontainers.image.source="https://github.com/microsoft/BitNet" \
      org.opencontainers.image.revision="0b341e582afbf9e1011f24744b554c96a3477eb5" \
      org.opencontainers.image.licenses="MIT"

RUN apt-get update -qq && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates=20240203 \
      curl=8.5.0-2ubuntu10.16 \
      coreutils=9.4-3ubuntu6.3 \
      libgomp1=14.2.0-4ubuntu2~24.04.1 && \
    groupadd --gid 10001 bitnet && \
    useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent \
      --shell /usr/sbin/nologin bitnet && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

COPY --from=build --chown=0:0 /src/BitNet/build/bin/ /opt/bitnet/bin/
COPY --chown=0:0 --chmod=0555 docker/cpu/entrypoint.sh /opt/bitnet/entrypoint.sh

ENV LD_LIBRARY_PATH=/opt/bitnet/bin \
    MODEL_PATH=/models/ggml-model-i2_s.gguf \
    BITNET_THREADS=8 \
    BITNET_CONTEXT=4096 \
    BITNET_MAX_PREDICT=256 \
    BITNET_TEMPERATURE=0.8

USER 10001:10001
WORKDIR /tmp
EXPOSE 15842
HEALTHCHECK --interval=10s --timeout=3s --start-period=180s --retries=3 \
  CMD curl --fail --silent --show-error http://127.0.0.1:15842/health >/dev/null || exit 1
ENTRYPOINT ["/opt/bitnet/entrypoint.sh"]

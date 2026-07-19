#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose is required" >&2
  exit 1
fi

mkdir -p .runtime/nvidia-driver-libs
find .runtime/nvidia-driver-libs -mindepth 1 -maxdepth 1 -delete
for lib in \
  /usr/lib/x86_64-linux-gnu/libcuda.so* \
  /usr/lib/x86_64-linux-gnu/libcudadebugger.so* \
  /usr/lib/x86_64-linux-gnu/libnvidia-allocator.so* \
  /usr/lib/x86_64-linux-gnu/libnvidia-ml.so* \
  /usr/lib/x86_64-linux-gnu/libnvidia-ptxjitcompiler.so*
do
  cp -P "$lib" .runtime/nvidia-driver-libs/
done

docker compose pull
docker compose up -d
docker compose ps

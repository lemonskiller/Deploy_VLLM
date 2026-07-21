#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p logs

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export VLLM_API_KEY="${VLLM_API_KEY:-admin}"
export VLLM_DEPLOY_DIR="$ROOT_DIR"
export VLLM_IDLE_MS="${VLLM_IDLE_MS:-600000}"

if [[ -f .runtime/idle-proxy.pid ]]; then
  old_pid="$(cat .runtime/idle-proxy.pid)"
  if [[ -n "$old_pid" ]] && kill -0 "$old_pid" 2>/dev/null; then
    echo "idle proxy already running: $old_pid"
    exit 0
  fi
fi

mkdir -p .runtime
setsid node scripts/idle_proxy.js >> logs/idle-proxy.log 2>&1 < /dev/null &
echo "$!" > .runtime/idle-proxy.pid
echo "idle proxy started: $(cat .runtime/idle-proxy.pid)"

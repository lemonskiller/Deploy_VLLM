#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .runtime/idle-proxy.pid ]]; then
  echo "idle proxy PID file not found"
  exit 0
fi

pid="$(cat .runtime/idle-proxy.pid)"
if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
  kill "$pid"
  echo "idle proxy stopped: $pid"
else
  echo "idle proxy not running: $pid"
fi
rm -f .runtime/idle-proxy.pid

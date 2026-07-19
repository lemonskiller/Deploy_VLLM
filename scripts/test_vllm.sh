#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
source .env 2>/dev/null || source .env.example
set +a

BASE_URL="http://127.0.0.1:${VLLM_HOST_PORT:-18000}/v1"

curl -sS "$BASE_URL/models"
echo

curl -sS "$BASE_URL/chat/completions" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local-test-key' \
  -d "{
    \"model\": \"${SERVED_MODEL_NAME:-deepseek-r1:8b-vllm}\",
    \"messages\": [{\"role\": \"user\", \"content\": \"用一句话解释 vLLM 和 Ollama 的区别。\"}],
    \"temperature\": 0.2,
    \"max_tokens\": 128
  }"
echo


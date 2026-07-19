#!/usr/bin/env python3
import json
import os
import time
import urllib.request


PROMPT = os.environ.get("BENCH_PROMPT", "用三句话解释什么是本地大模型推理，并给出一个应用场景。")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "deepseek-r1:8b")
VLLM_URL = os.environ.get("VLLM_URL", "http://127.0.0.1:18000/v1")
VLLM_MODEL = os.environ.get("VLLM_MODEL", "deepseek-r1:8b-vllm")
MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "256"))


def post_json(url, payload, headers=None):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    start = time.perf_counter()
    with urllib.request.urlopen(req, timeout=600) as resp:
        body = resp.read()
    elapsed = time.perf_counter() - start
    return elapsed, json.loads(body.decode("utf-8"))


def bench_ollama():
    elapsed, body = post_json(
        f"{OLLAMA_URL}/api/generate",
        {"model": OLLAMA_MODEL, "prompt": PROMPT, "stream": False, "options": {"num_predict": MAX_TOKENS}},
    )
    output_tokens = body.get("eval_count")
    tokens_per_second = None
    if output_tokens and body.get("eval_duration"):
        tokens_per_second = output_tokens / (body["eval_duration"] / 1_000_000_000)
    return {
        "backend": "ollama",
        "model": OLLAMA_MODEL,
        "latency_seconds": round(elapsed, 3),
        "prompt_tokens": body.get("prompt_eval_count"),
        "output_tokens": output_tokens,
        "tokens_per_second": round(tokens_per_second, 2) if tokens_per_second else None,
    }


def bench_vllm():
    elapsed, body = post_json(
        f"{VLLM_URL}/chat/completions",
        {
            "model": VLLM_MODEL,
            "messages": [{"role": "user", "content": PROMPT}],
            "temperature": 0.2,
            "max_tokens": MAX_TOKENS,
        },
        headers={"Authorization": "Bearer local-benchmark"},
    )
    usage = body.get("usage") or {}
    output_tokens = usage.get("completion_tokens")
    return {
        "backend": "vllm",
        "model": VLLM_MODEL,
        "latency_seconds": round(elapsed, 3),
        "prompt_tokens": usage.get("prompt_tokens"),
        "output_tokens": output_tokens,
        "tokens_per_second": round(output_tokens / elapsed, 2) if output_tokens else None,
    }


def main():
    results = []
    for fn in (bench_ollama, bench_vllm):
        try:
            results.append(fn())
        except Exception as exc:
            results.append({"backend": fn.__name__.replace("bench_", ""), "error": str(exc)})
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()


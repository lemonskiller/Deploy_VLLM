# Deploy VLLM

This repository deploys a vLLM OpenAI-compatible API for comparing a Hugging Face model with the existing Ollama service.

Default target:

- Ollama model already present: `deepseek-r1:8b`
- vLLM served name: `deepseek-r1:8b-vllm`
- vLLM model: `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B`
- GPU: `2`
- Local API: `http://127.0.0.1:18000/v1`
- Model cache mount: `/nfs/wxz/source/huggingface/hub`

## Start

```bash
cd /nfs/wxz/others/Deploy_VLLM
cp .env.example .env
./scripts/start.sh
```

The first startup downloads the Hugging Face model through `https://hf-mirror.com` into `/nfs/wxz/source/huggingface/hub`.

## Test

```bash
./scripts/test_vllm.sh
```

## Compare Ollama And vLLM

```bash
./scripts/benchmark_ollama_vs_vllm.py
```

The benchmark calls:

- Ollama: `http://127.0.0.1:11434/api/generate`
- vLLM: `http://127.0.0.1:18000/v1/chat/completions`

## Docker Permission

The current `wuxinze` user must be able to access Docker:

```bash
docker ps
```

If that fails with permission denied, an administrator should add the user to the Docker group or run the deployment with an account that has Docker access:

```bash
sudo usermod -aG docker wuxinze
```

After group membership changes, log out and log back in.


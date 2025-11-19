# GitHub, HuggingFace & Google Colab Integration

## Overview

The Multi-Hive Crown system now supports:
- **GitHub repositories as shards** - Clone any repo and convert to virtual shard
- **HuggingFace model downloads** - Direct downloads from HuggingFace Hub
- **Google Colab fine-tuning** - One-click notebook generation

## GitHub Integration

### Clone Repository as Shard

```bash
POST /crown/github/clone
{
  "repoUrl": "https://github.com/cline/cline.git",
  "options": {
    "force": false
  }
}
```

**Auto-converts repos to shards:**
- Analyzes code structure
- Detects language & frameworks
- Generates API endpoints
- Creates shard definition

### Popular Repositories

```bash
GET /crown/github/popular
```

Returns pre-configured list including:
- Cline (AI agent)
- Stability-AI/generative-models
- ColossalAI
- ParlAI (Facebook)
- LLaMA, Mistral, GPT4All
- AutoGPT, LangChain
- And more...

### List Cloned Repos

```bash
GET /crown/github/list
```

## HuggingFace Integration

### Download Model

```bash
POST /crown/huggingface/download
{
  "modelId": "meta-llama/Llama-2-7b-hf",
  "options": {
    "method": "auto"  // "cli", "git", or "auto"
  }
}
```

**Supports:**
- PyTorch models (.safetensors)
- TensorFlow models
- ONNX models
- GGUF models (llama.cpp)

### Popular Models

```bash
GET /crown/huggingface/popular
```

Returns curated list:
- **Text Generation**: Llama 2, Mistral, Phi-2, TinyLlama
- **Code**: CodeLlama, WizardCoder
- **Embeddings**: MiniLM, BGE
- **Vision**: CLIP, LLaVA
- **Image Gen**: Stable Diffusion, SDXL
- **Speech**: Whisper

### List Downloaded Models

```bash
GET /crown/huggingface/list
```

## Google Colab Integration

### Generate Fine-Tuning Notebook

```bash
POST /crown/colab/generate
{
  "crownName": "asx-language-pro",
  "modelId": "meta-llama/Llama-2-7b-hf",
  "options": {
    "epochs": 3,
    "batchSize": 4,
    "learningRate": "2e-4",
    "loraR": 16,
    "loraAlpha": 32,
    "loraDropout": 0.05
  }
}
```

**Generated notebook includes:**
1. GPU setup & dependency installation
2. Download Crown data from your server
3. Load base model with 4-bit quantization
4. Prepare dataset from Crown knowledge
5. Configure PEFT/LoRA
6. Fine-tune model
7. Save & export model
8. Test inference
9. Export to Ollama format

**Returns:**
```json
{
  "notebook": { /* Jupyter notebook JSON */ },
  "path": "agents/colab/finetune-model-crown.ipynb",
  "colabUrl": "https://colab.research.google.com/..."
}
```

## Example Workflows

### 1. Clone Cline as Shard

```bash
curl -X POST http://localhost:3000/crown/github/clone \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/cline/cline.git"
  }'

# Cline is now a virtual shard!
# Access via: /mesh/cline/execute
```

### 2. Download Llama 2 from HuggingFace

```bash
curl -X POST http://localhost:3000/crown/huggingface/download \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "meta-llama/Llama-2-7b-hf"
  }'

# Model downloaded to: agents/huggingface/meta-llama--Llama-2-7b-hf/
```

### 3. Fine-Tune on Colab

```bash
# Generate notebook
curl -X POST http://localhost:3000/crown/colab/generate \
  -H "Content-Type: application/json" \
  -d '{
    "crownName": "asx-language-pro",
    "modelId": "meta-llama/Llama-2-7b-hf",
    "options": {"epochs": 3}
  }'

# Response includes Colab URL
# Click to open in Google Colab
# Run notebook with one click!
```

### 4. Complete Multi-Agent Workflow

```bash
# 1. Clone agent framework
curl -X POST http://localhost:3000/crown/github/clone \
  -d '{"repoUrl": "https://github.com/langchain-ai/langchain.git"}'

# 2. Download LLM
curl -X POST http://localhost:3000/crown/huggingface/download \
  -d '{"modelId": "mistralai/Mistral-7B-v0.1"}'

# 3. Build Crown with your knowledge
curl -X POST http://localhost:3000/crown/upload \
  -F "crownName=my-expert" \
  -F "files=@knowledge.pdf"

# 4. Generate Colab notebook for fine-tuning
curl -X POST http://localhost:3000/crown/colab/generate \
  -d '{"crownName":"my-expert","modelId":"mistralai/Mistral-7B-v0.1"}'

# 5. Create agent (LangChain + fine-tuned Mistral + Crown)
curl -X POST http://localhost:3000/crown/agents/create \
  -d '{
    "agentName":"expert-agent",
    "modelName":"langchain",
    "crownName":"my-expert"
  }'
```

## GitHub Repos as Shards

When you clone a GitHub repo, it becomes a virtual shard with:

**Auto-detected API endpoints:**
- `/info` - Repository information
- `/files` - List all files
- `/proxy/*` - Proxy to internal server (if detected)
- `/predict` - ML inference (if model detected)
- `/execute` - Run agent (if agent detected)

**Example: Cline Shard**
```json
{
  "id": "cline",
  "source": "github",
  "type": "java-agent",
  "port": 3005,
  "api": [
    {"path": "/info", "method": "GET"},
    {"path": "/execute", "method": "POST"}
  ],
  "metadata": {
    "language": "java",
    "frameworks": ["kotlin"],
    "hasTests": true
  }
}
```

## HuggingFace Models as Shards

Downloaded HF models become inference shards:

**Auto-generated API:**
- `/info` - Model information
- `/generate` - Text generation
- `/embed` - Create embeddings
- `/chat` - Chat completion

**Example: Llama 2 Shard**
```json
{
  "id": "meta-llama--Llama-2-7b-hf",
  "source": "huggingface",
  "type": "text-generation",
  "port": 3006,
  "api": [
    {"path": "/generate", "method": "POST"},
    {"path": "/chat", "method": "POST"}
  ],
  "metadata": {
    "framework": "pytorch",
    "modelType": "llama",
    "hasTokenizer": true
  }
}
```

## Colab Notebook Features

Generated notebooks include:

**Setup & Dependencies:**
- GPU detection (T4, V100, etc.)
- Auto-install transformers, PEFT, bitsandbytes
- HuggingFace Hub integration

**Crown Integration:**
- Downloads Crown data from your Multi-Hive server
- Injects Crown knowledge into system prompt
- Uses Crown examples for training

**Efficient Training:**
- 4-bit quantization (QLoRA)
- PEFT/LoRA for parameter-efficient fine-tuning
- Gradient accumulation
- Mixed precision (FP16)

**Export Options:**
- Save to HuggingFace Hub
- Download as ZIP
- Generate Ollama Modelfile
- GGUF conversion (optional)

## Installation Requirements

### For GitHub Integration
```bash
# Git is required
git --version

# Optional: git-lfs for large files
git lfs install
```

### For HuggingFace Integration
```bash
# Option 1: HuggingFace CLI (recommended)
pip install huggingface_hub
huggingface-cli login

# Option 2: Git LFS (fallback)
git lfs install
```

### For Colab Integration
No installation needed! Notebooks run in Google Colab cloud.

## Popular Models Reference

### Text Generation (Small/Fast)
- `microsoft/phi-2` (2.7B) - Fast, capable
- `TinyLlama/TinyLlama-1.1B-Chat-v1.0` (1.1B) - Tiny but good

### Text Generation (Standard)
- `meta-llama/Llama-2-7b-hf` (7B) - Meta's Llama 2
- `mistralai/Mistral-7B-v0.1` (7B) - Mistral AI

### Code Generation
- `codellama/CodeLlama-7b-hf` (7B) - Meta Code Llama
- `WizardLM/WizardCoder-15B-V1.0` (15B) - WizardCoder

### Embeddings
- `sentence-transformers/all-MiniLM-L6-v2` (22M)
- `BAAI/bge-small-en-v1.5` (33M)

### Multimodal
- `openai/clip-vit-base-patch32` (151M) - CLIP
- `llava-hf/llava-1.5-7b-hf` (7B) - LLaVA

### Image Generation
- `stabilityai/stable-diffusion-2-1` (900M)
- `stabilityai/stable-diffusion-xl-base-1.0` (6.9B)

### GGUF (llama.cpp)
- `TheBloke/Llama-2-7B-GGUF`
- `TheBloke/Mistral-7B-Instruct-v0.2-GGUF`

## Benefits

### 🐙 GitHub Integration
- **Zero config**: Clone any repo instantly
- **Auto-convert**: Repos become shards automatically
- **Virtual APIs**: RESTful access to code/models
- **16+ popular repos** pre-configured

### 🤗 HuggingFace Integration
- **Direct downloads**: No manual setup
- **Auto-detect**: Framework & model type
- **Shard conversion**: Models become API endpoints
- **16+ popular models** curated

### 🔬 Colab Integration
- **One-click**: Generate & run notebooks
- **Free GPU**: Train on Google's T4 GPUs
- **Crown-powered**: Your knowledge integrated
- **Export-ready**: Save/download/deploy models

## Next Steps

1. **Clone a repo**: Start with Cline or LangChain
2. **Download a model**: Try Llama 2 or Mistral
3. **Build a Crown**: Upload your knowledge base
4. **Generate Colab**: Fine-tune with one click
5. **Create agents**: Combine repos + models + Crowns

---

**GitHub + HuggingFace + Colab = Ultimate AI Stack** 🚀

All models, all repos, all knowledge - unified in Multi-Hive!

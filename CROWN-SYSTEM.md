# 👑 AI Crown System - Complete Guide

## Overview

The **AI Crown System** lets you create specialized AI agents by combining models with knowledge-rich Crowns. Upload your own models (Qwen, Cline, GGUF, etc.), build Crowns from massive datasets (PDF, code, lore, stats), and fine-tune Ollama models with your data.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│   Upload    │────▶│ Build Crown  │────▶│ Create Agent  │
│   Model     │     │  from Data   │     │ Model + Crown │
└─────────────┘     └──────────────┘     └───────────────┘
      │                     │                      │
      │                     ▼                      ▼
      │             ┌──────────────┐      ┌───────────────┐
      │             │ SCX Compress │      │ AI Agent with │
      │             │   Knowledge  │      │ Specialized   │
      │             └──────────────┘      │   Knowledge   │
      │                                   └───────────────┘
      ▼
┌─────────────┐
│  Fine-Tune  │
│   Ollama    │
│   Models    │
└─────────────┘
```

## Quick Start

### 1. Start the Server

```bash
npm install
npm start

# Visit http://localhost:3000/crown-manager.html
```

### 2. Upload a Model

**Option A: Via UI**
- Go to "📦 Models" tab
- Drag & drop model files (safetensors, JARs, GGUF, etc.)
- Click "Upload Model"

**Option B: Via API**
```bash
curl -X POST http://localhost:3000/crown/models/upload \
  -F "modelName=qwen-asx" \
  -F "modelType=qwen" \
  -F "files=@model.safetensors" \
  -F "files=@config.json" \
  -F "files=@tokenizer.json"
```

### 3. Build a Crown

**Option A: Via UI**
- Go to "👑 Crowns" tab
- Enter Crown name and description
- Drag & drop knowledge files (PDF, TXT, MD, JS, PY, etc.)
- Click "Build Crown"

**Option B: Via API**
```bash
curl -X POST http://localhost:3000/crown/upload \
  -F "crownName=my-expert" \
  -F "description=Expert in X" \
  -F "systemPrompt=You are an expert..." \
  -F "files=@knowledge.pdf" \
  -F "files=@code.js" \
  -F "files=@lore.md"
```

### 4. Create an Agent

**Option A: Via UI**
- Go to "🤖 Agents" tab
- Select model and Crown
- Enter agent name
- Click "Create Agent"

**Option B: Via API**
```bash
curl -X POST http://localhost:3000/crown/agents/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "my-ai-agent",
    "modelName": "qwen-asx",
    "crownName": "my-expert",
    "options": {"temperature": 0.7}
  }'
```

### 5. Fine-Tune Ollama (Optional)

**Via UI:**
- Go to "⚡ Fine-Tune" tab
- Select base Ollama model (llama2, mistral, etc.)
- Choose Crown
- Enter new model name
- Click "Generate Modelfile"

**Via API:**
```bash
curl -X POST http://localhost:3000/crown/finetune \
  -H "Content-Type: application/json" \
  -d '{
    "baseModel": "llama2",
    "crownName": "my-expert",
    "newModelName": "llama2-expert"
  }'

# Then create the model:
ollama create llama2-expert -f agents/ollama/llama2-expert.Modelfile
```

## Supported Models

### 1. Qwen (HuggingFace Transformers)

Required files:
- `model.safetensors`
- `config.json`
- `tokenizer.json`
- `tokenizer_config.json`
- `vocab.json`
- `merges.txt`

Upload to: `agents/qwen/`

### 2. Cline (Java Agent)

Required files:
- `cline-1.0.9.jar`
- `grpc-*.jar`
- `kotlin-stdlib-*.jar`
- Other dependency JARs

Upload to: `agents/cline/lib/`

### 3. GGUF (llama.cpp)

Required files:
- `*.gguf` model file

Upload to: `agents/gguf/`

### 4. ONNX (Cross-platform)

Required files:
- `*.onnx` model file

Upload to: `agents/onnx/`

### 5. Ollama (Local)

No upload needed - connect to `localhost:11434`

Can fine-tune with Crown data!

## Crown Data Formats

Crowns support these file formats:

### Documents
- **PDF** - Research papers, books, documentation
- **TXT** - Plain text knowledge
- **MD** - Markdown documentation

### Code
- **JS** - JavaScript examples
- **PY** - Python code
- **PHP** - PHP code
- **HTML/CSS** - Web code

### Data
- **JSON** - Structured data, stats, inventory
- **XJSON** - Multi-Hive format
- **YAML/TOML** - Configuration data

## Crown Structure

```json
{
  "name": "my-crown",
  "version": "1.0.0",
  "description": "Expert in...",
  "type": "knowledge",

  "knowledge": {
    "documents": [
      {"name": "guide.md", "content": "..."}
    ],
    "code": [
      {"name": "example.js", "content": "..."}
    ],
    "lore": ["fact 1", "fact 2"],
    "stats": [{"metric": "value"}],
    "inventory": [{"item": "details"}]
  },

  "fineTuning": {
    "conversations": [
      {"instruction": "Q", "output": "A"}
    ],
    "instructions": ["rule 1", "rule 2"]
  },

  "config": {
    "temperature": 0.7,
    "systemPrompt": "You are...",
    "personality": "helpful",
    "specializations": ["topic1", "topic2"]
  }
}
```

## API Reference

### Crown Management

#### Build Crown
```
POST /crown/build
{
  "name": "my-crown",
  "directory": "/path/to/data",
  "options": {
    "description": "...",
    "systemPrompt": "..."
  }
}
```

#### Upload Crown Data
```
POST /crown/upload
FormData:
  crownName: "my-crown"
  description: "..."
  systemPrompt: "..."
  files: [multiple files]
```

#### List Crowns
```
GET /crown/list
Response: {
  "crowns": [
    {"name": "...", "version": "...", "type": "..."}
  ]
}
```

#### Load Crown
```
POST /crown/load
{
  "crownName": "my-crown"
}
```

#### Get Crown Context
```
GET /crown/context?name=my-crown
Response: {
  "crown": "my-crown",
  "context": "# Knowledge base...",
  "length": 12345
}
```

### Model Management

#### List Models
```
GET /crown/models/list
Response: {
  "models": [
    {
      "name": "qwen",
      "type": "qwen",
      "framework": "transformers",
      "files": ["model.safetensors", ...]
    }
  ]
}
```

#### Upload Model
```
POST /crown/models/upload
FormData:
  modelName: "my-model"
  modelType: "qwen"
  files: [model files]
```

#### Delete Model
```
DELETE /crown/models/delete
{
  "modelName": "my-model"
}
```

### Agent Management

#### Create Agent
```
POST /crown/agents/create
{
  "agentName": "my-agent",
  "modelName": "qwen",
  "crownName": "my-crown",
  "options": {
    "temperature": 0.7,
    "maxTokens": 2048
  }
}
```

#### List Agents
```
GET /crown/agents/list
Response: {
  "agents": [
    {
      "name": "my-agent",
      "model": "qwen",
      "crown": "my-crown",
      "config": {...}
    }
  ]
}
```

#### Get Agent
```
GET /crown/agents/get?name=my-agent
Response: {
  "agent": {...}
}
```

### Fine-Tuning

#### Generate Ollama Modelfile
```
POST /crown/finetune
{
  "baseModel": "llama2",
  "crownName": "my-crown",
  "newModelName": "llama2-custom"
}

Response: {
  "modelfile": "agents/ollama/llama2-custom.Modelfile",
  "command": "ollama create llama2-custom -f ...",
  "trainingExamples": 150
}
```

## Example Workflow

### Build ASX Language Expert

1. **Upload Qwen Model**
```bash
# Place Qwen files in agents/qwen/
ls agents/qwen/
# model.safetensors, config.json, tokenizer.json, etc.
```

2. **Create ASX Crown**

The ASX Language Pro Crown is pre-built at `examples/crowns/asx-language-pro.json`

It includes:
- K'uhul glyph reference
- XJSON format guide
- KLH orchestration docs
- SCX compression examples
- Training conversations

3. **Create Agent**
```bash
curl -X POST http://localhost:3000/crown/agents/create \
  -H "Content-Type: application/json" \
  -d '{
    "agentName": "asx-expert",
    "modelName": "qwen",
    "crownName": "asx-language-pro"
  }'
```

4. **Fine-Tune Ollama**
```bash
curl -X POST http://localhost:3000/crown/finetune \
  -H "Content-Type: application/json" \
  -d '{
    "baseModel": "llama2",
    "crownName": "asx-language-pro",
    "newModelName": "llama2-asx"
  }'

# Create model
ollama create llama2-asx -f agents/ollama/llama2-asx.Modelfile
```

5. **Use Agent**
```bash
# Chat with fine-tuned model
curl -X POST http://localhost:3000/ai/ollama/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama2-asx",
    "messages": [
      {"role": "user", "content": "Write K'\''uhul code to fetch data"}
    ]
  }'
```

## Advanced Features

### Multi-Format Ingestion

Crown Builder automatically:
- Extracts markdown headings for indexing
- Parses code for functions/classes
- Chunks text for training
- Compresses with SCX (87% reduction)

### Automatic Training Data

From your Crown knowledge, the system generates:
- **Instruction-response pairs** from documents
- **Code examples** from source files
- **Q&A pairs** from structured data
- **Conversation datasets** from JSON

### Context Injection

When you create an agent with a Crown:
- Crown knowledge is injected into system prompt
- Documents, lore, stats available to model
- Code examples included in context
- Personality and specializations configured

### SCX Compression

All Crowns are compressed via SCX:
- **87% size reduction** on average
- Atomic symbol replacement
- Fast decompression
- Enables micro-knowledge bases

## UI Features

### Crown Manager (`/crown-manager.html`)

**Models Tab:**
- Drag & drop upload
- Auto-detect model type
- View installed models

**Crowns Tab:**
- Build Crowns from files
- Set description and system prompt
- View available Crowns

**Agents Tab:**
- Create agents (model + crown)
- Configure temperature
- View active agents

**Fine-Tune Tab:**
- Select base Ollama model
- Choose Crown
- Generate Modelfile
- Instructions for deployment

## File Structure

```
agents/
├── configurations/       # Agent configs
│   └── my-agent.json
├── qwen/                # Qwen model files
│   ├── model.safetensors
│   ├── config.json
│   └── ...
├── cline/               # Cline JARs
│   └── lib/
│       └── *.jar
├── ollama/              # Generated Modelfiles
│   └── model-name.Modelfile
└── README.md

examples/crowns/
└── asx-language-pro.json  # Pre-built Crown

server/crown/
├── crown-builder.js     # Build Crowns from data
├── crown-loader.js      # Load into context
├── crown-api.js         # HTTP API
└── model-manager.js     # Model/agent management

public/
└── crown-manager.html   # Interactive UI
```

## Benefits

### 🎯 Specialized AI
Create domain-expert agents with Crown knowledge

### 📚 Massive Knowledge
Ingest PDFs, code, lore, stats - unlimited data

### 🗜️ Tiny Storage
87% compression via SCX atomic encoding

### 🔧 Fine-Tuning
Generate Ollama Modelfiles from Crowns

### 🚀 No Framework
Pure Multi-Hive stack - no React, no Vue

### 💰 Cost-Free
Local models, no API fees, unlimited usage

### 🔒 Private
Your data never leaves your machine

## Examples

### Game Master Crown

```bash
# Build RPG game master Crown
curl -X POST http://localhost:3000/crown/upload \
  -F "crownName=game-master" \
  -F "description=Expert RPG game master" \
  -F "files=@world-lore.md" \
  -F "files=@character-stats.json" \
  -F "files=@inventory-items.json" \
  -F "files=@quest-database.json"

# Create agent
curl -X POST http://localhost:3000/crown/agents/create \
  -d '{
    "agentName": "dungeon-master",
    "modelName": "qwen",
    "crownName": "game-master"
  }'
```

### Code Expert Crown

```bash
# Build programming expert Crown
curl -X POST http://localhost:3000/crown/upload \
  -F "crownName=code-expert" \
  -F "files=@algorithms.js" \
  -F "files=@patterns.py" \
  -F "files=@best-practices.md" \
  -F "files=@examples.php"
```

### Lore Master Crown

```bash
# Build fantasy lore Crown
curl -X POST http://localhost:3000/crown/upload \
  -F "crownName=lore-master" \
  -F "files=@history.pdf" \
  -F "files=@mythology.txt" \
  -F "files=@characters.json" \
  -F "files=@timeline.md"
```

## Troubleshooting

### Model Not Detected

Check that required files are present:
- **Qwen**: model.safetensors + config.json
- **Cline**: *.jar files in lib/
- **GGUF**: *.gguf file

### Crown Build Failed

Ensure:
- Files are supported formats (PDF, TXT, MD, JSON, code)
- Files are readable
- Crown name is unique

### Fine-Tuning Failed

Verify:
- Ollama is running (`ollama serve`)
- Base model exists (`ollama list`)
- Crown is loaded

## Next Steps

1. **Upload your models** to `agents/` directory
2. **Build Crowns** from your knowledge base
3. **Create specialized agents** (model + crown)
4. **Fine-tune Ollama** with Crown data
5. **Chat with your Crown-powered AI!**

---

**The AI Crown awaits your knowledge.** 👑

Upload models, build Crowns, create specialized agents!

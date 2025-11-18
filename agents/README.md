# Agents Directory

This directory contains AI models and agent configurations for the Multi-Hive system.

## Supported Agent Types

### 1. Cline (Java-based Agent)
Place Cline JARs in `agents/cline/lib/`:
```
agents/cline/
├── lib/
│   ├── cline-1.0.9.jar
│   ├── grpc-*.jar
│   ├── kotlin-stdlib-*.jar
│   └── ... (other JARs)
└── metadata.json
```

### 2. Qwen (Transformer Model)
Place Qwen model files in `agents/qwen/`:
```
agents/qwen/
├── model.safetensors
├── config.json
├── tokenizer.json
├── tokenizer_config.json
├── vocab.json
├── merges.txt
└── metadata.json
```

### 3. Ollama Models
Connect to Ollama running on localhost:11434.
No files needed - models are managed by Ollama.

### 4. Custom Models
Supported formats:
- **GGUF** (llama.cpp compatible)
- **ONNX** (cross-platform)
- **Safetensors** (HuggingFace)
- **Custom REST API** endpoints

## Upload Models via UI

1. Visit `/demo.html` or `/crown-manager.html`
2. Go to "Model Management" tab
3. Click "Upload Model"
4. Select files and upload
5. Model will be auto-detected

## Agent Configurations

Created agents are stored in `agents/configurations/`:
```json
{
  "name": "asx-language-pro",
  "model": "qwen-asx-merged",
  "crown": "asx-language-pro",
  "config": {
    "temperature": 0.7,
    "systemPrompt": "You are an ASX Language expert...",
    "maxTokens": 2048
  }
}
```

## Create Agent via API

```bash
POST /crown/agents/create
{
  "agentName": "my-agent",
  "modelName": "qwen",
  "crownName": "my-crown",
  "options": {
    "temperature": 0.7
  }
}
```

## Fine-tune with Crown

```bash
POST /crown/finetune
{
  "baseModel": "llama2",
  "crownName": "asx-language-pro",
  "newModelName": "llama2-asx"
}
```

This generates an Ollama Modelfile. Then run:
```bash
ollama create llama2-asx -f agents/ollama/llama2-asx.Modelfile
```

---

Upload your models, create Crowns, and build specialized AI agents!

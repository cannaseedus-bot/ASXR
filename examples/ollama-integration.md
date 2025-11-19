# Ollama Integration Guide

## Overview

The Multi-Hive AI Crown can attach to **any local REST API**, including:
- **Ollama** - Local LLM runner
- **LM Studio** - Desktop AI application
- **LocalAI** - Self-hosted AI API
- **Any custom REST API**

## Quick Start with Ollama

### 1. Install Ollama

```bash
# macOS/Linux
curl https://ollama.ai/install.sh | sh

# Or download from https://ollama.ai
```

### 2. Pull Models

```bash
# Pull Llama 2
ollama pull llama2

# Pull other models
ollama pull mistral
ollama pull codellama
ollama pull neural-chat
```

### 3. Start Multi-Hive

```bash
npm start
# Ollama will be auto-detected on http://localhost:11434
```

## API Endpoints

### List Available Models

```bash
GET /ai/ollama/models

# Response
{
  "models": [
    {
      "name": "llama2:latest",
      "size": 3826793677,
      "modified": "2024-01-15T..."
    }
  ]
}
```

### Chat with Ollama Model

```bash
POST /ai/ollama/chat
Content-Type: application/json

{
  "model": "llama2",
  "messages": [
    {
      "role": "user",
      "content": "Explain quantum computing"
    }
  ]
}

# Response
{
  "model": "llama2",
  "message": {
    "role": "assistant",
    "content": "Quantum computing is..."
  },
  "done": true
}
```

### Multi-Model Swarm Chat

Query multiple models in parallel and get consensus:

```bash
POST /ai/ollama/swarm
Content-Type: application/json

{
  "message": "What is the capital of France?",
  "models": ["llama2", "mistral", "neural-chat"]
}

# Response
{
  "message": "What is the capital of France?",
  "models": ["llama2", "mistral", "neural-chat"],
  "responses": [
    {
      "model": "llama2",
      "success": true,
      "response": "The capital of France is Paris.",
      "stats": { "duration": 1234, "tokens": 45 }
    },
    {
      "model": "mistral",
      "success": true,
      "response": "Paris is the capital of France.",
      "stats": { "duration": 1456, "tokens": 42 }
    }
  ],
  "consensus": {
    "primary": "The capital of France is Paris.",
    "model": "llama2",
    "alternatives": [...]
  }
}
```

### Generate Completion

```bash
POST /ai/ollama/generate
Content-Type: application/json

{
  "model": "codellama",
  "prompt": "Write a Python function to calculate fibonacci"
}

# Response
{
  "model": "codellama",
  "response": "def fibonacci(n):\n    if n <= 1:\n        return n\n    return fibonacci(n-1) + fibonacci(n-2)",
  "done": true
}
```

## JavaScript Client Examples

### Using KLH Client

```javascript
import { KLHClient } from './lib/klh/client.js';

const klh = new KLHClient();

// List models
const response = await fetch('/api/ai/ollama/models');
const { models } = await response.json();
console.log('Available models:', models);

// Chat with model
const chatResponse = await fetch('/api/ai/ollama/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'llama2',
    messages: [
      { role: 'user', content: 'Hello!' }
    ]
  })
});

const result = await chatResponse.json();
console.log('AI:', result.message.content);
```

### Multi-Model Swarm

```javascript
// Query multiple models simultaneously
const swarmResponse = await fetch('/api/ai/ollama/swarm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Explain async/await in JavaScript',
    models: ['llama2', 'mistral', 'codellama']
  })
});

const swarmResult = await swarmResponse.json();

console.log('Consensus:', swarmResult.consensus.primary);
console.log('From model:', swarmResult.consensus.model);

// See all responses
swarmResult.responses.forEach(r => {
  console.log(`${r.model}: ${r.response}`);
});
```

### Via Virtual Mesh

Attach Ollama as a shard:

```javascript
const aiCrownShard = {
  id: 'ai-crown',
  port: 3002,
  runtime: 'kuhul',
  api: [
    {
      path: '/chat',
      method: 'POST',
      handler: async (data) => {
        // Proxy to Ollama
        const response = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          body: JSON.stringify({
            model: 'llama2',
            messages: data.messages
          })
        });
        return await response.json();
      }
    }
  ]
};

await klh.registerShard(aiCrownShard);

// Now chat via mesh
const result = await klh.hiveFetch('http://localhost:3002/chat', {
  method: 'POST',
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'Hello AI Crown!' }
    ]
  })
});
```

## Configuration

Update `asx-config.json`:

```json
{
  "hive": "my-app",
  "shards": [...],
  "ai": {
    "ollama": {
      "enabled": true,
      "url": "http://localhost:11434",
      "defaultModel": "llama2"
    },
    "localAPIs": [
      {
        "name": "ollama",
        "url": "http://localhost:11434"
      },
      {
        "name": "lmstudio",
        "url": "http://localhost:1234"
      }
    ]
  }
}
```

## Advanced: Connect to Any Local API

The Multi-Hive can connect to **any** local REST API:

```javascript
// In your shard
const customAPIShard = {
  id: 'custom-api',
  port: 3003,
  api: [
    {
      path: '/proxy',
      method: 'POST',
      handler: async (data) => {
        // Call any local API
        const response = await fetch('http://localhost:5000/api/endpoint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return await response.json();
      }
    }
  ]
};
```

## Examples

### Code Generation

```javascript
const code = await fetch('/api/ai/ollama/generate', {
  method: 'POST',
  body: JSON.stringify({
    model: 'codellama',
    prompt: 'Create a React component for a todo list'
  })
});
```

### Question Answering

```javascript
const answer = await fetch('/api/ai/ollama/chat', {
  method: 'POST',
  body: JSON.stringify({
    model: 'llama2',
    messages: [
      { role: 'user', content: 'What is the Multi-Hive OS?' }
    ]
  })
});
```

### Multi-Expert Consensus

```javascript
// Get consensus from multiple specialized models
const consensus = await fetch('/api/ai/ollama/swarm', {
  method: 'POST',
  body: JSON.stringify({
    message: 'Explain the Byzantine Generals Problem',
    models: ['llama2', 'mistral', 'neural-chat']
  })
});

// Returns consensus with alternatives for comparison
```

## Benefits

### 🚀 Zero Latency
Local models = instant responses, no cloud delays

### 🔒 Privacy First
Your data never leaves your machine

### 💰 Cost-Free
No API fees, no tokens, unlimited usage

### 🌐 Offline Capable
Works without internet connection

### 🎯 Model Diversity
Run multiple models, compare outputs, get consensus

### ⚡ Multi-Hive Integration
Ollama becomes another shard in your distributed OS

## Troubleshooting

### Ollama Not Detected

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve
```

### Model Not Found

```bash
# List installed models
ollama list

# Pull missing model
ollama pull llama2
```

### Connection Refused

Check `asx-config.json` Ollama URL matches your setup. Default is `http://localhost:11434`.

## Next Steps

- Try the [Interactive Demo](/demo.html)
- Read the [Full API Reference](../README.md#api-reference)
- Explore [Multi-Model Swarms](#multi-model-swarm)
- Build custom [AI-powered shards](#via-virtual-mesh)

---

**The AI Crown awaits your models.** 👑

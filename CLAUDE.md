# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Start server (production, port 3000)
npm start

# Development mode
npm run dev

# Custom port
npx asxr-multi-hive start 8080

# Build production bundle to dist/
npm run build
```

No test runner is configured yet (`npm test` uses `node --test tests/**/*.test.js` but no tests exist).

### Key URLs after starting
- `http://localhost:3000` — Main boot UI (`index.html`)
- `http://localhost:3000/demo.html` — Multi-Hive stack demo
- `http://localhost:3000/crown-manager.html` — AI Crown manager
- `http://localhost:3000/api/health` — Health check

## Architecture

All source is ES modules (`"type": "module"` in package.json). Node.js >= 18 required.

### Server Request Flow

```
bin/asxr.js  (CLI, spawns server)
    └─ server/index.js  (HTTP + WebSocket, routes by URL prefix)
           ├─ /api/*       → handleAPI() inline
           ├─ /mesh/*      → VirtualMeshRouter
           ├─ /ai/*        → AISwarmServer
           ├─ /crown/*     → CrownAPI
           └─ static files → serveStatic() (falls back to repo root)
```

### Four Core Technologies

The stack is built around four interoperating layers, each in `lib/`:

| Layer | File | Role |
|-------|------|------|
| **KLH** | `lib/klh/client.js` | Browser client — boots hive, registers shards, routes mesh calls via `hiveFetch()` |
| **XJSON** | `lib/xjson/parser.js` | Parses `⟁`-prefixed JSON; compiles view trees to HTML |
| **K'uhul** | `lib/kuhul/vm.js` | Stack-based glyph VM (Pop/Wo/Ch'en/Yax/Sek/K'ayab'/Kumk'u/Xul) |
| **SCX** | `lib/scx/codec.js` | Dictionary symbol-replace + path-flatten compression (~87% reduction) |

The server-side counterpart of KLH lives in `server/core/hive-orchestrator.js`. Shards are in-memory JS objects; there are no real network ports per shard — the `port` field is a virtual identifier used for mesh routing.

### Crown System

The Crown system (`server/crown/`) is a knowledge-base-to-fine-tune pipeline:

```
CrownBuilder   — ingests files (PDF/MD/JS/PY/JSON/XJSON/etc.), extracts symbols/headings,
                 builds structured Crown JSON, compresses with SCX
CrownLoader    — loads a Crown and renders its knowledge into a flat context string
ModelManager   — owns local uploaded models, GitHub repos, HuggingFace downloads, Colab notebooks
CrownAPI       — routes all /crown/* HTTP endpoints
```

External integrations in `server/crown/`:
- `github-integration.js` — `git clone` a repo into `agents/github/<name>/`, auto-generates `.shard.json`
- `huggingface-integration.js` — downloads via `huggingface-cli` or `git lfs`, auto-generates `.shard.json`
- `colab-integration.js` — builds a complete Jupyter notebook (cells as JSON) for PEFT/LoRA fine-tuning

### AI Layer

`server/core/ai-swarm.js` handles `/ai/*` routes and owns WebSocket connections on `/ai/swarm`. It delegates to:
- `server/core/ollama-bridge.js` — Ollama (`:11434`), LM Studio (`:1234`), and any local REST API; includes `swarmChat()` for parallel multi-model queries
- Ollama is auto-detected on startup; its models populate `this.ollama.models`

### Hive Boot Sequence

1. `HiveOrchestrator.boot(config)` — parses `asx-config.json` via `XJSONParser`, creates shard objects, maps virtual ports
2. In dev mode the server auto-loads `asx-config.json`
3. Shards are stored in `hive.shards` (Map keyed by shard id); routing goes through `hive.routeToShard(id, method, path, data)`

### XJSON Key Convention

All XJSON keys use the `⟁` prefix (U+27C1). `XJSONParser.normalize()` strips this prefix so downstream code always works with clean keys. `addPrefixes()` re-applies them for serialization.

### SCX Compression

`SCXCodec` maintains a 40-symbol dictionary (common XJSON/KLH/K'uhul terms → single chars). `encode()` compresses an object to a `⟁`-separated flat string. `decode()` reverses it. Stats are available via `getStats(original, compressed)`.

### Agent / Model Storage Layout

```
agents/
  configurations/   — JSON files per created agent (model + crown + config)
  github/<name>/    — cloned repos, each with .shard.json
  huggingface/<id>/ — downloaded HF models, each with .shard.json
  ollama/           — generated Ollama Modelfiles
  colab/            — generated .ipynb notebooks
  cline/lib/        — Cline Java JARs (java-agent type)
  qwen/             — Qwen safetensors model (auto-detected)
examples/crowns/    — Crown JSON files (asx-language-pro.json pre-built)
```

### Stub Files (not yet implemented)

- `terminal/basher.js`, `emu/jsnes_core.js` — empty stubs
- `python/asx_train.py`, `asx_infer.py`, `asx_ngram_builder.py`, `deepseek_core.py`, `model_utils.py` — all empty stubs (6 bytes each)
- `tapes/` — empty directory for tape definitions
- The `index.html` boot UI initialises minimal inline stubs for `window.ASX`, `window.SCX`, `window.EMU`, `window.STUDIO` but does not load the real libraries

### Active Branch

Development happens on `claude/multi-hive-os-stack-01KuW5hUQrFHVCqrbF24en6Q`. Always push to this branch.

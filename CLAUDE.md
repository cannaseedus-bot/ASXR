# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (REQUIRED on first run)
npm install

# Start server (production, port 3000)
npm start

# Development mode (auto-loads asx-config.json)
npm run dev

# Custom port
npx asxr-multi-hive start 8080

# Build production bundle to dist/ (NOT YET IMPLEMENTED)
npm run build
```

**Testing**: No test runner configured. `npm test` points to `node --test tests/**/*.test.js` but tests/ directory doesn't exist.

### Key URLs after starting
- `http://localhost:3000/api/health` — Health check (✓ VERIFIED WORKING)
- `http://localhost:3000/api/hive/status` — Hive status (✓ VERIFIED WORKING)
- `http://localhost:3000/api/hive/shards` — List shards (✓ VERIFIED WORKING)
- `http://localhost:3000` — Main boot UI (`index.html`)
- `http://localhost:3000/demo.html` — Multi-Hive stack demo
- `http://localhost:3000/crown-manager.html` — AI Crown manager

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

## Implementation Status

### ✅ Verified Working
- **HTTP Server** - Starts on port 3000, serves static files, handles API routes
- **Health Endpoint** - `/api/health` returns server stats
- **Hive Status** - `/api/hive/status` returns orchestrator state
- **Shards Listing** - `/api/hive/shards` returns empty array (endpoint functional)
- **HiveOrchestrator** - Initializes, maintains shard registry
- **All Core Libraries Exist** - KLH, XJSON, K'uhul, SCX modules are present

### ⚠️ Implemented But Untested
- **Shard Creation** - `POST /api/hive/shards` exists but no test data
- **Mesh Routing** - `/mesh/:shardId/*` logic exists but never called
- **Crown Building** - `CrownBuilder.buildFromDirectory()` logic exists but never executed
- **SCX Compression** - `encode()/decode()` methods exist but compression ratio (87%) unverified
- **K'uhul VM** - Glyph execution logic exists but no programs tested
- **XJSON Parser** - `parse()/compile()` methods exist but no real XJSON processed
- **AI Swarm** - `/ai/*` endpoints exist but Ollama not running
- **GitHub Integration** - Clone logic exists, 16 repos pre-configured, never tested
- **HuggingFace Integration** - Download logic exists, 16 models pre-configured, never tested
- **Colab Notebooks** - Generation logic creates valid `.ipynb` structure, never tested
- **Crown Loader** - `getCrownContext()` renders knowledge, never loaded real Crown

### ❌ Not Implemented
- **Build System** - `npm run build` exists but `scripts/build.js` is empty stub
- **Tests** - No tests exist (`tests/` directory doesn't exist)
- **Shard Handlers** - GitHub repos clone but `.shard.json` files never route to actual repo functionality
- **Real Mesh Networking** - All "ports" are virtual labels; no actual inter-process communication
- **Python Scripts** - `python/*.py` all 6-byte empty stubs

### 🎯 Crown System Use Cases (User Intent)

The Crown system is designed for:
1. **Character Roles** - Load personality/behavior from Crown (system prompts, temperature, specializations)
2. **Domain Agents** - Fine-tune models on specific domains (legal, medical, gaming, code)
3. **Agentic Coding** - Build Crowns from codebases to create code-aware agents
4. **Semantic Agents** - Parse `.toml`/`.yaml` configs as agent definitions

**Current State**: Crown infrastructure exists (Builder, Loader, Manager, API) but no end-to-end example demonstrating character roles or domain specialization.

### 🚀 Next Steps to Make This Real

**Priority 1 - Prove Crown System Works:**
1. Create a test Crown from real data (e.g., `examples/crowns/`)
2. Build Crown using `CrownBuilder.buildFromDirectory()`
3. Verify SCX compression ratio
4. Load Crown via `CrownLoader.getCrownContext()`
5. Test with Ollama model (if available) or mock AI

**Priority 2 - Prove Shard System Works:**
1. Boot hive with `asx-config.json`
2. Create test shard via API
3. Route mesh call to shard
4. Verify K'uhul handler execution

**Priority 3 - Prove Integrations Work:**
1. Clone a GitHub repo, verify `.shard.json` generation
2. Test Crown building from cloned repo
3. Generate Colab notebook, verify it runs

## Stub Files Reference

- `terminal/basher.js`, `emu/jsnes_core.js` — empty stubs
- `python/*.py` (5 files) — all empty 6-byte stubs
- `tapes/` — empty directory
- `scripts/build.js` — empty stub
- `index.html` — Inline stubs for `window.ASX`, `window.SCX`, `window.EMU`, `window.STUDIO` (doesn't load real libraries)

## Active Branch

Development happens on `claude/multi-hive-os-stack-01KuW5hUQrFHVCqrbF24en6Q`. Always push to this branch.

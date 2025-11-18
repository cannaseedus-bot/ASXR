#!/usr/bin/env node

/**
 * ASXR Multi-Hive Server
 * Full-stack server with REST API, static hosting, and AI chat swarm
 */

import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import mime from 'mime-types';
import { HiveOrchestrator } from './core/hive-orchestrator.js';
import { VirtualMeshRouter } from './core/virtual-mesh.js';
import { AISwarmServer } from './core/ai-swarm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const PORT = portArg >= 0 ? parseInt(args[portArg + 1]) : (process.env.PORT || 3000);
const DEV_MODE = args.includes('--dev') || process.env.ASXR_MODE === 'development';

// Initialize Multi-Hive components
const hive = new HiveOrchestrator();
const mesh = new VirtualMeshRouter(hive);
const aiSwarm = new AISwarmServer(hive);

/**
 * HTTP Server with REST API and static file serving
 */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Routes
  if (url.pathname.startsWith('/api/')) {
    await handleAPI(req, res, url);
    return;
  }

  // Virtual Mesh Routes (inter-shard communication)
  if (url.pathname.startsWith('/mesh/')) {
    await mesh.handleRequest(req, res, url);
    return;
  }

  // AI Swarm Routes
  if (url.pathname.startsWith('/ai/')) {
    await aiSwarm.handleRequest(req, res, url);
    return;
  }

  // Static file serving
  await serveStatic(req, res, url);
});

/**
 * REST API Handler
 */
async function handleAPI(req, res, url) {
  const endpoint = url.pathname.replace('/api/', '');

  try {
    switch (endpoint) {
      case 'hive/status':
        respondJSON(res, 200, await hive.getStatus());
        break;

      case 'hive/shards':
        if (req.method === 'GET') {
          respondJSON(res, 200, await hive.listShards());
        } else if (req.method === 'POST') {
          const body = await readBody(req);
          const shard = await hive.createShard(JSON.parse(body));
          respondJSON(res, 201, shard);
        }
        break;

      case 'hive/boot':
        const bootBody = await readBody(req);
        const config = JSON.parse(bootBody);
        await hive.boot(config);
        respondJSON(res, 200, { status: 'booted', hive: hive.id });
        break;

      case 'mesh/routes':
        respondJSON(res, 200, mesh.getRoutes());
        break;

      case 'health':
        respondJSON(res, 200, {
          status: 'ok',
          uptime: process.uptime(),
          hive: hive.id,
          shards: hive.shards.size,
          timestamp: Date.now()
        });
        break;

      default:
        respondJSON(res, 404, { error: 'Endpoint not found' });
    }
  } catch (err) {
    console.error('API Error:', err);
    respondJSON(res, 500, { error: err.message });
  }
}

/**
 * Static file server
 */
async function serveStatic(req, res, url) {
  let filePath = path.join(ROOT_DIR, 'public', url.pathname);

  // Default to index.html for directory requests
  if (url.pathname === '/' || url.pathname.endsWith('/')) {
    filePath = path.join(ROOT_DIR, 'index.html');
  }

  try {
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const content = await fs.readFile(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': content.length,
      'Cache-Control': DEV_MODE ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Try serving from root for lib files
      try {
        const rootFile = path.join(ROOT_DIR, url.pathname.slice(1));
        const content = await fs.readFile(rootFile);
        const mimeType = mime.lookup(rootFile) || 'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': mimeType,
          'Content-Length': content.length
        });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      }
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
    }
  }
}

/**
 * WebSocket Server for real-time AI swarm communication
 */
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  console.log(`[WS] Client connected: ${url.pathname}`);

  if (url.pathname.startsWith('/ai/swarm')) {
    aiSwarm.handleWebSocket(ws, url);
  } else if (url.pathname.startsWith('/mesh/stream')) {
    mesh.handleWebSocket(ws, url);
  } else {
    ws.send(JSON.stringify({ error: 'Unknown WebSocket endpoint' }));
    ws.close();
  }
});

/**
 * Start server
 */
server.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   🚀 ASXR MULTI-HIVE SERVER ONLINE       ║
╚═══════════════════════════════════════════╝

  Mode:        ${DEV_MODE ? 'Development' : 'Production'}
  Port:        ${PORT}
  Local:       http://localhost:${PORT}

  Stack Components:
  🏗️  KLH      - Hive Orchestrator
  📦 XJSON    - Data Definition Engine
  ⚡ K'uhul   - Glyph Execution Engine
  🗜️  SCX      - Compression Layer

  Endpoints:
  GET  /                    - Multi-Hive UI
  GET  /api/health          - Health check
  GET  /api/hive/status     - Hive status
  POST /api/hive/boot       - Boot hive from config
  GET  /api/hive/shards     - List shards
  POST /api/hive/shards     - Create shard
  *    /mesh/*              - Virtual mesh routing
  *    /ai/*                - AI swarm endpoints
  WS   /ai/swarm            - AI chat swarm WebSocket
  WS   /mesh/stream         - Mesh streaming

  Press Ctrl+C to stop
`);

  // Auto-boot default hive in dev mode
  if (DEV_MODE) {
    try {
      const defaultConfig = await fs.readFile(path.join(ROOT_DIR, 'asx-config.json'), 'utf8');
      if (defaultConfig && defaultConfig.trim() !== '{}') {
        await hive.boot(JSON.parse(defaultConfig));
        console.log('  ✓ Auto-booted default hive from asx-config.json\n');
      }
    } catch (err) {
      console.log('  ℹ No default hive config found\n');
    }
  }
});

/**
 * Utility functions
 */
function respondJSON(res, status, data) {
  const json = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json)
  });
  res.end(json);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Multi-Hive Server...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});

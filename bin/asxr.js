#!/usr/bin/env node

/**
 * ASXR Multi-Hive CLI
 * npx-runnable full-stack AI app builder
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const command = args[0] || 'start';

console.log(`
╔═══════════════════════════════════════════╗
║   ASXR MULTI-HIVE OS                      ║
║   KLH + XJSON + K'uhul + SCX              ║
╚═══════════════════════════════════════════╝
`);

switch (command) {
  case 'start':
  case 'serve':
    const port = args[1] || process.env.PORT || 3000;
    console.log(`🚀 Starting Multi-Hive Server on port ${port}...\n`);
    const server = spawn('node', [join(__dirname, '../server/index.js'), '--port', port], {
      stdio: 'inherit',
      env: { ...process.env, ASXR_MODE: 'production' }
    });
    server.on('error', (err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
    break;

  case 'dev':
    console.log('🔧 Starting Multi-Hive Server in DEV mode...\n');
    const devServer = spawn('node', [join(__dirname, '../server/index.js'), '--dev'], {
      stdio: 'inherit',
      env: { ...process.env, ASXR_MODE: 'development' }
    });
    devServer.on('error', (err) => {
      console.error('Failed to start dev server:', err);
      process.exit(1);
    });
    break;

  case 'build':
    console.log('🏗️  Building Multi-Hive Application...\n');
    const build = spawn('node', [join(__dirname, '../scripts/build.js')], {
      stdio: 'inherit'
    });
    build.on('exit', (code) => process.exit(code));
    break;

  case 'help':
  default:
    console.log(`
Usage: npx asxr-multi-hive [command] [options]

Commands:
  start [port]    Start the Multi-Hive server (default: 3000)
  serve [port]    Alias for 'start'
  dev             Start in development mode with hot reload
  build           Build optimized Multi-Hive application
  help            Show this help message

Examples:
  npx asxr-multi-hive start 8080
  npx asxr-multi-hive dev
  npx asxr-multi-hive build

Multi-Hive Stack:
  🏗️  KLH     - Hive orchestration & virtual mesh networking
  📦 XJSON   - Universal data definition language
  ⚡ K'uhul  - Glyph-based execution engine
  🗜️  SCX     - Atomic compression layer

Visit https://github.com/cannaseedus-bot/ASXR for documentation
`);
    break;
}

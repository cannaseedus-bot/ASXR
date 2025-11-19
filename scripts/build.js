#!/usr/bin/env node

/**
 * Multi-Hive Build Script
 * Bundles and optimizes the complete stack for production
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

console.log(`
╔═══════════════════════════════════════════╗
║   🏗️  MULTI-HIVE BUILD SYSTEM            ║
╚═══════════════════════════════════════════╝
`);

async function build() {
  console.log('[Build] Starting Multi-Hive build...\n');

  // Create dist directory
  const distDir = path.join(ROOT, 'dist');
  await fs.mkdir(distDir, { recursive: true });
  console.log('✓ Created dist directory');

  // Bundle client libraries
  console.log('\n[Build] Bundling client libraries...');

  const libs = [
    { src: 'lib/klh/client.js', name: 'klh.js' },
    { src: 'lib/xjson/parser.js', name: 'xjson.js' },
    { src: 'lib/kuhul/vm.js', name: 'kuhul.js' },
    { src: 'lib/scx/codec.js', name: 'scx.js' }
  ];

  for (const lib of libs) {
    const srcPath = path.join(ROOT, lib.src);
    const destPath = path.join(distDir, lib.name);

    const content = await fs.readFile(srcPath, 'utf8');
    await fs.writeFile(destPath, content);

    console.log(`  ✓ Bundled ${lib.name}`);
  }

  // Copy static files
  console.log('\n[Build] Copying static files...');

  const staticFiles = [
    'index.html',
    'public/demo.html'
  ];

  for (const file of staticFiles) {
    const srcPath = path.join(ROOT, file);

    try {
      const content = await fs.readFile(srcPath, 'utf8');
      const destPath = path.join(distDir, path.basename(file));
      await fs.writeFile(destPath, content);

      console.log(`  ✓ Copied ${file}`);
    } catch (err) {
      console.log(`  ⚠ Skipped ${file} (not found)`);
    }
  }

  // Create bundle manifest
  console.log('\n[Build] Creating manifest...');

  const manifest = {
    name: 'asxr-multi-hive',
    version: '1.0.0',
    built: new Date().toISOString(),
    stack: ['KLH', 'XJSON', 'K\'uhul', 'SCX'],
    files: libs.map(l => l.name).concat(staticFiles.map(f => path.basename(f)))
  };

  await fs.writeFile(
    path.join(distDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log('  ✓ Created manifest.json');

  // Build summary
  const stats = await getBuildStats(distDir);

  console.log(`
╔═══════════════════════════════════════════╗
║   ✅ BUILD COMPLETE                       ║
╚═══════════════════════════════════════════╝

  Output:      dist/
  Files:       ${stats.files}
  Total size:  ${(stats.size / 1024).toFixed(2)} KB

  Stack Components:
  🏗️  KLH      - Hive orchestration
  📦 XJSON    - Data definitions
  ⚡ K'uhul   - Execution engine
  🗜️  SCX      - Compression

  Run: node server/index.js
  Or:  npx asxr-multi-hive start
`);
}

async function getBuildStats(dir) {
  const files = await fs.readdir(dir);
  let totalSize = 0;

  for (const file of files) {
    const stat = await fs.stat(path.join(dir, file));
    totalSize += stat.size;
  }

  return {
    files: files.length,
    size: totalSize
  };
}

// Run build
build().catch(err => {
  console.error('\n❌ Build failed:', err.message);
  process.exit(1);
});

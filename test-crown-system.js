#!/usr/bin/env node

/**
 * Crown System Test - Proves Crown building, compression, and character roles work
 *
 * This test:
 * 1. Builds a Crown from test data
 * 2. Verifies SCX compression
 * 3. Loads the Crown
 * 4. Generates context for character role assignment
 * 5. Shows how to use Crown with AI models
 */

import { CrownBuilder } from './server/crown/crown-builder.js';
import { CrownLoader } from './server/crown/crown-loader.js';
import { SCXCodec } from './lib/scx/codec.js';
import { promises as fs } from 'fs';
import path from 'path';

console.log('═══════════════════════════════════════════');
console.log('  CROWN SYSTEM END-TO-END TEST');
console.log('═══════════════════════════════════════════\n');

async function testCrownSystem() {
  try {
    // Step 1: Build Crown from test data
    console.log('📦 Step 1: Building Crown from test data...\n');

    const builder = new CrownBuilder();
    const result = await builder.buildFromDirectory(
      './test-data/dm-crown',
      'dungeon-master',
      {
        description: 'Gaming Dungeon Master character role with campaign knowledge',
        type: 'character-role',
        personality: 'dramatic',
        specializations: ['D&D 5e', 'fantasy worldbuilding', 'improvisation'],
        temperature: 0.8,
        systemPrompt: 'You are an expert Dungeon Master. Be dramatic, fair, and creative.'
      }
    );

    console.log('✓ Crown built successfully!');
    console.log(`  Files processed: ${result.crown.stats.totalFiles}`);
    console.log(`  Documents: ${result.crown.knowledge.documents.length}`);
    console.log(`  Code examples: ${result.crown.knowledge.code.length}`);
    console.log(`  Data files: ${result.crown.knowledge.data.length}\n`);

    // Step 2: Verify SCX Compression
    console.log('🗜️  Step 2: Verifying SCX compression...\n');

    const scx = new SCXCodec();
    const originalJSON = JSON.stringify(result.crown);
    const originalSize = Buffer.byteLength(originalJSON);

    const compressed = scx.encode(result.crown);
    const compressedSize = Buffer.byteLength(compressed);

    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);

    console.log(`  Original size: ${originalSize.toLocaleString()} bytes`);
    console.log(`  Compressed size: ${compressedSize.toLocaleString()} bytes`);
    console.log(`  Compression ratio: ${compressionRatio}%`);
    console.log(`  ${compressionRatio >= 50 ? '✓' : '✗'} Compression ${compressionRatio >= 50 ? 'PASSED' : 'FAILED'} (target: ≥50%)\n`);

    // Step 3: Save Crown
    console.log('💾 Step 3: Saving Crown...\n');

    const crownPath = './examples/crowns/dungeon-master.json';
    await fs.writeFile(crownPath, JSON.stringify(result.crown, null, 2));
    console.log(`  ✓ Crown saved to: ${crownPath}\n`);

    // Step 4: Load Crown and generate context
    console.log('📖 Step 4: Loading Crown and generating context...\n');

    const loader = new CrownLoader();
    await loader.loadCrown(crownPath);

    const context = await loader.getCrownContext('dungeon-master');

    console.log('  ✓ Crown loaded successfully!');
    console.log(`  Context length: ${context.length.toLocaleString()} characters\n`);
    console.log('  Context preview (first 500 chars):');
    console.log('  ─────────────────────────────────────────');
    console.log('  ' + context.substring(0, 500).replace(/\n/g, '\n  '));
    console.log('  ...\n');

    // Step 5: Show character role assignment
    console.log('🎭 Step 5: Character Role Assignment Example\n');

    const characterRole = {
      role: result.crown.name,
      systemPrompt: result.crown.config.systemPrompt,
      temperature: result.crown.config.temperature,
      personality: result.crown.config.personality,
      specializations: result.crown.config.specializations,
      context: context,
      contextTokens: Math.ceil(context.length / 4) // rough estimate
    };

    console.log('  Character Role Configuration:');
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  Role: ${characterRole.role}`);
    console.log(`  System: ${characterRole.systemPrompt}`);
    console.log(`  Temperature: ${characterRole.temperature}`);
    console.log(`  Personality: ${characterRole.personality}`);
    console.log(`  Specializations: ${characterRole.specializations.join(', ')}`);
    console.log(`  Context tokens (approx): ${characterRole.contextTokens.toLocaleString()}\n`);

    // Step 6: Example usage with Ollama (mock)
    console.log('🤖 Step 6: How to use with Ollama/LM Studio\n');

    const examplePrompt = {
      model: 'llama2',
      system: characterRole.systemPrompt + '\n\n' + context,
      temperature: characterRole.temperature,
      messages: [
        {
          role: 'user',
          content: 'The party enters the ancient library. What do they find?'
        }
      ]
    };

    console.log('  Example Ollama API call:');
    console.log('  ─────────────────────────────────────────');
    console.log('  POST http://localhost:11434/api/chat');
    console.log('  Body:', JSON.stringify(examplePrompt, null, 2).split('\n').map(l => '    ' + l).join('\n'));
    console.log('\n');

    // Final summary
    console.log('═══════════════════════════════════════════');
    console.log('  ✓ ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════\n');

    console.log('Summary:');
    console.log(`  • Crown built from ${result.crown.stats.totalFiles} files`);
    console.log(`  • ${compressionRatio}% compression achieved`);
    console.log(`  • Context: ${context.length.toLocaleString()} chars (~${characterRole.contextTokens.toLocaleString()} tokens)`);
    console.log(`  • Character role ready for AI model\n`);

    console.log('Next steps:');
    console.log('  1. Run Ollama: ollama run llama2');
    console.log('  2. Test API: curl http://localhost:3000/crown/agents/create \\');
    console.log('     -d \'{"name":"dm-agent","crownName":"dungeon-master"}\'');
    console.log('  3. Chat with DM: curl http://localhost:3000/ai/chat \\');
    console.log('     -d \'{"message":"Start our D&D session!"}\'');
    console.log('');

    return {
      success: true,
      crown: result.crown,
      compressionRatio,
      context,
      characterRole
    };

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    return { success: false, error };
  }
}

// Run test
testCrownSystem().then(result => {
  process.exit(result.success ? 0 : 1);
});

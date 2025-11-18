/**
 * Crown Loader
 * Loads Crown knowledge into AI context
 * Manages Crown registry and model fine-tuning
 */

import { promises as fs } from 'fs';
import path from 'path';
import { SCXCodec } from '../../lib/scx/codec.js';

export class CrownLoader {
  constructor() {
    this.scx = new SCXCodec();
    this.loadedCrowns = new Map();
    this.crownRegistry = new Map();
  }

  /**
   * Load Crown from file
   */
  async loadCrown(crownPath) {
    console.log(`[Crown] Loading Crown from ${crownPath}...`);

    let crownData;

    // Check if compressed (.scx.json) or regular
    if (crownPath.endsWith('.scx.json')) {
      const compressed = await fs.readFile(crownPath, 'utf8');
      crownData = this.scx.decode(compressed);
    } else {
      const content = await fs.readFile(crownPath, 'utf8');
      crownData = JSON.parse(content);
    }

    this.loadedCrowns.set(crownData.name, crownData);
    this.crownRegistry.set(crownData.name, {
      name: crownData.name,
      version: crownData.version,
      type: crownData.type,
      loaded: new Date().toISOString(),
      path: crownPath
    });

    console.log(`[Crown] Loaded "${crownData.name}" v${crownData.version}`);

    return crownData;
  }

  /**
   * Get Crown context for AI prompt injection
   */
  getCrownContext(crownName) {
    const crown = this.loadedCrowns.get(crownName);
    if (!crown) {
      throw new Error(`Crown not found: ${crownName}`);
    }

    // Build context string from Crown knowledge
    let context = '';

    // System prompt
    if (crown.config?.systemPrompt) {
      context += `${crown.config.systemPrompt}\n\n`;
    }

    // Knowledge base
    if (crown.knowledge) {
      context += `# ${crown.name} Knowledge Base\n\n`;

      // Documents
      if (crown.knowledge.documents?.length > 0) {
        context += `## Documentation\n`;
        crown.knowledge.documents.forEach(doc => {
          context += `### ${doc.name}\n${doc.content}\n\n`;
        });
      }

      // Lore
      if (crown.knowledge.lore?.length > 0) {
        context += `## Lore\n${crown.knowledge.lore.join('\n')}\n\n`;
      }

      // Stats
      if (crown.knowledge.stats?.length > 0) {
        context += `## Stats\n${JSON.stringify(crown.knowledge.stats, null, 2)}\n\n`;
      }

      // Inventory
      if (crown.knowledge.inventory?.length > 0) {
        context += `## Inventory\n${JSON.stringify(crown.knowledge.inventory, null, 2)}\n\n`;
      }

      // Code examples
      if (crown.knowledge.code?.length > 0) {
        context += `## Code Examples\n`;
        crown.knowledge.code.forEach(code => {
          context += `### ${code.name}\n\`\`\`${code.type}\n${code.content}\n\`\`\`\n\n`;
        });
      }
    }

    return context;
  }

  /**
   * Get all loaded Crowns
   */
  listCrowns() {
    return Array.from(this.crownRegistry.values());
  }

  /**
   * Get Crown data
   */
  getCrown(crownName) {
    return this.loadedCrowns.get(crownName);
  }

  /**
   * Unload Crown
   */
  unloadCrown(crownName) {
    this.loadedCrowns.delete(crownName);
    this.crownRegistry.delete(crownName);
    console.log(`[Crown] Unloaded "${crownName}"`);
  }
}

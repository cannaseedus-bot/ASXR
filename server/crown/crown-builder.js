/**
 * Crown Builder
 * Ingests massive amounts of data (PDF, TXT, MD, code, JSON, XJSON)
 * and creates compressed Crown knowledge bases via SCX
 */

import { promises as fs } from 'fs';
import path from 'path';
import { SCXCodec } from '../../lib/scx/codec.js';

export class CrownBuilder {
  constructor() {
    this.scx = new SCXCodec();
    this.supportedFormats = [
      'txt', 'md', 'json', 'js', 'py', 'php', 'html', 'css',
      'xjson', 'pdf', 'csv', 'yaml', 'toml'
    ];
  }

  /**
   * Build Crown from directory of files
   */
  async buildFromDirectory(dirPath, crownName, options = {}) {
    console.log(`[Crown] Building "${crownName}" from ${dirPath}...`);

    const crown = {
      name: crownName,
      version: '1.0.0',
      created: new Date().toISOString(),
      description: options.description || `Crown built from ${dirPath}`,
      type: options.type || 'knowledge',

      // Crown metadata
      stats: {
        totalFiles: 0,
        totalSize: 0,
        compressedSize: 0,
        compressionRatio: 0
      },

      // Knowledge base
      knowledge: {
        documents: [],
        code: [],
        data: [],
        lore: [],
        stats: [],
        inventory: []
      },

      // Fine-tuning data
      fineTuning: {
        conversations: [],
        instructions: [],
        examples: []
      },

      // Crown behavior configuration
      config: {
        temperature: options.temperature || 0.7,
        systemPrompt: options.systemPrompt || '',
        personality: options.personality || 'helpful',
        specializations: options.specializations || []
      }
    };

    // Recursively read all files
    const files = await this.getAllFiles(dirPath);
    crown.stats.totalFiles = files.length;

    let totalOriginalSize = 0;

    for (const filePath of files) {
      const ext = path.extname(filePath).slice(1).toLowerCase();

      if (!this.supportedFormats.includes(ext)) {
        console.log(`[Crown] Skipping unsupported format: ${filePath}`);
        continue;
      }

      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stat = await fs.stat(filePath);
        totalOriginalSize += stat.size;

        // Parse and categorize content
        const entry = await this.parseFile(filePath, content, ext);

        // Categorize by type
        if (['md', 'txt', 'pdf'].includes(ext)) {
          crown.knowledge.documents.push(entry);
        } else if (['js', 'py', 'php', 'html', 'css'].includes(ext)) {
          crown.knowledge.code.push(entry);
        } else if (['json', 'xjson', 'yaml', 'toml'].includes(ext)) {
          crown.knowledge.data.push(entry);
        }

        // Extract training examples if structured
        if (ext === 'json' || ext === 'xjson') {
          try {
            const data = JSON.parse(content);

            // Look for conversation/training data
            if (data.conversations) {
              crown.fineTuning.conversations.push(...data.conversations);
            }
            if (data.instructions) {
              crown.fineTuning.instructions.push(...data.instructions);
            }
            if (data.lore) {
              crown.knowledge.lore.push(...(Array.isArray(data.lore) ? data.lore : [data.lore]));
            }
            if (data.stats) {
              crown.knowledge.stats.push(data.stats);
            }
            if (data.inventory) {
              crown.knowledge.inventory.push(...(Array.isArray(data.inventory) ? data.inventory : [data.inventory]));
            }
          } catch (e) {
            // Not structured training data, keep as general data
          }
        }

      } catch (err) {
        console.error(`[Crown] Error processing ${filePath}:`, err.message);
      }
    }

    crown.stats.totalSize = totalOriginalSize;

    // Compress entire Crown with SCX
    const compressed = this.scx.encode(crown);
    const compressedSize = typeof compressed === 'string'
      ? compressed.length
      : JSON.stringify(compressed).length;

    crown.stats.compressedSize = compressedSize;
    crown.stats.compressionRatio = ((totalOriginalSize - compressedSize) / totalOriginalSize * 100).toFixed(2);

    console.log(`[Crown] "${crownName}" built successfully!`);
    console.log(`[Crown] Files: ${crown.stats.totalFiles}`);
    console.log(`[Crown] Original: ${(totalOriginalSize / 1024).toFixed(2)} KB`);
    console.log(`[Crown] Compressed: ${(compressedSize / 1024).toFixed(2)} KB`);
    console.log(`[Crown] Compression: ${crown.stats.compressionRatio}%`);

    return {
      crown,
      compressed,
      stats: crown.stats
    };
  }

  /**
   * Build Crown from single file
   */
  async buildFromFile(filePath, crownName, options = {}) {
    const content = await fs.readFile(filePath, 'utf8');
    const ext = path.extname(filePath).slice(1).toLowerCase();

    const entry = await this.parseFile(filePath, content, ext);

    const crown = {
      name: crownName,
      version: '1.0.0',
      created: new Date().toISOString(),
      description: options.description || `Crown from ${path.basename(filePath)}`,
      type: 'single-file',
      knowledge: {
        documents: [entry]
      },
      config: options.config || {}
    };

    const compressed = this.scx.encode(crown);

    return { crown, compressed };
  }

  /**
   * Parse file content based on format
   */
  async parseFile(filePath, content, ext) {
    const entry = {
      path: filePath,
      name: path.basename(filePath),
      type: ext,
      size: content.length,
      content: null,
      metadata: {}
    };

    switch (ext) {
      case 'json':
      case 'xjson':
        try {
          entry.content = JSON.parse(content);
          entry.metadata.parsed = true;
        } catch {
          entry.content = content;
        }
        break;

      case 'md':
        entry.content = content;
        entry.metadata.format = 'markdown';
        // Extract headings for indexing
        entry.metadata.headings = this.extractMarkdownHeadings(content);
        break;

      case 'py':
      case 'js':
      case 'php':
        entry.content = content;
        entry.metadata.format = 'code';
        // Extract functions/classes
        entry.metadata.symbols = this.extractCodeSymbols(content, ext);
        break;

      case 'pdf':
        // For PDF, we'd need a PDF parser library
        // For now, store raw content or metadata
        entry.content = content;
        entry.metadata.format = 'pdf';
        entry.metadata.note = 'PDF parsing requires additional library';
        break;

      default:
        entry.content = content;
    }

    return entry;
  }

  /**
   * Extract markdown headings for indexing
   */
  extractMarkdownHeadings(markdown) {
    const headings = [];
    const lines = markdown.split('\n');

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2]
        });
      }
    }

    return headings;
  }

  /**
   * Extract code symbols (functions, classes)
   */
  extractCodeSymbols(code, language) {
    const symbols = [];

    // Simple regex-based extraction (could be enhanced with AST parsing)
    if (language === 'js') {
      // Functions: function name() or const name = ()
      const funcRegex = /(?:function|const|let|var)\s+(\w+)\s*[=(]/g;
      let match;
      while ((match = funcRegex.exec(code)) !== null) {
        symbols.push({ type: 'function', name: match[1] });
      }
    } else if (language === 'py') {
      // Functions: def name()
      const funcRegex = /def\s+(\w+)\s*\(/g;
      let match;
      while ((match = funcRegex.exec(code)) !== null) {
        symbols.push({ type: 'function', name: match[1] });
      }
      // Classes: class Name
      const classRegex = /class\s+(\w+)/g;
      while ((match = classRegex.exec(code)) !== null) {
        symbols.push({ type: 'class', name: match[1] });
      }
    }

    return symbols;
  }

  /**
   * Recursively get all files in directory
   */
  async getAllFiles(dirPath, fileList = []) {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        // Skip node_modules, .git, etc.
        if (!file.startsWith('.') && file !== 'node_modules') {
          await this.getAllFiles(filePath, fileList);
        }
      } else {
        fileList.push(filePath);
      }
    }

    return fileList;
  }

  /**
   * Build training dataset from Crown for fine-tuning
   */
  buildTrainingDataset(crown) {
    const dataset = [];

    // Add conversations
    if (crown.fineTuning?.conversations) {
      dataset.push(...crown.fineTuning.conversations);
    }

    // Generate instruction-response pairs from documents
    if (crown.knowledge?.documents) {
      for (const doc of crown.knowledge.documents) {
        // Split into chunks for training
        const chunks = this.chunkText(doc.content, 512);

        for (const chunk of chunks) {
          dataset.push({
            instruction: `Explain the following about ${crown.name}:`,
            input: '',
            output: chunk
          });
        }
      }
    }

    // Generate code examples
    if (crown.knowledge?.code) {
      for (const code of crown.knowledge.code) {
        dataset.push({
          instruction: `Write code for ${code.name}:`,
          input: '',
          output: code.content
        });
      }
    }

    return dataset;
  }

  /**
   * Chunk text for training
   */
  chunkText(text, maxLength = 512) {
    const chunks = [];
    const sentences = text.split(/[.!?]\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Save Crown to file
   */
  async saveCrown(crown, compressed, outputPath) {
    // Save both compressed and uncompressed versions
    await fs.writeFile(
      outputPath,
      JSON.stringify(crown, null, 2)
    );

    await fs.writeFile(
      outputPath.replace('.json', '.scx.json'),
      typeof compressed === 'string'
        ? compressed
        : JSON.stringify(compressed)
    );

    console.log(`[Crown] Saved to ${outputPath}`);
  }
}

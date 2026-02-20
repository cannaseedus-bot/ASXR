/**
 * Crown Browser API
 *
 * Browser-optimized REST endpoints for gpt-inference.html
 * - Serves models in SCX-TP-INT4 format
 * - Serves Crowns with personality configs
 * - Serves agent presets (model + crown combos)
 */

import { CrownLoader } from './crown-loader.js';
import { ModelManager } from './model-manager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '../..');

export class BrowserAPI {
  constructor() {
    this.crownLoader = new CrownLoader();
    this.modelManager = new ModelManager();
    this.modelsPath = path.join(PROJECT_ROOT, 'agents/scx-models');
    this.crownsPath = path.join(PROJECT_ROOT, 'examples/crowns');
    this.agentsPath = path.join(PROJECT_ROOT, 'agents/configurations');

    // Ensure directories exist
    this._ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  _ensureDirectories() {
    const dirs = [this.modelsPath, this.crownsPath, this.agentsPath];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Handle browser API requests
   */
  async handleRequest(pathname, req, res) {
    try {
      // Route based on pathname
      if (pathname === '/crown/browser/models') {
        return this.listModels(req, res);
      } else if (pathname.startsWith('/crown/browser/models/')) {
        const modelId = pathname.split('/').pop();
        return this.getModel(modelId, req, res);
      } else if (pathname === '/crown/browser/crowns') {
        return this.listCrowns(req, res);
      } else if (pathname.startsWith('/crown/browser/crowns/')) {
        const crownId = pathname.split('/').pop();
        return this.getCrown(crownId, req, res);
      } else if (pathname === '/crown/browser/agents') {
        return this.listAgents(req, res);
      } else if (pathname.startsWith('/crown/browser/agents/')) {
        const agentId = pathname.split('/').pop();
        return this.getAgent(agentId, req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      console.error('[BrowserAPI] Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * GET /crown/browser/models
   * List all available models for browser dropdown
   */
  async listModels(req, res) {
    const models = [];

    // Scan models directory
    if (fs.existsSync(this.modelsPath)) {
      const files = fs.readdirSync(this.modelsPath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.modelsPath, file);
            const modelData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

            // Extract metadata
            const modelId = file.replace('.json', '');
            const config = modelData.config || {};

            models.push({
              id: modelId,
              name: modelData.name || modelId,
              format: modelData.format || 'scx-tp-int4',
              size: this._getFileSize(filePath),
              compression: modelData.compression_ratio || '7.11x',
              config: {
                num_layers: config.num_layers || 12,
                hidden_size: config.hidden_size || 512,
                n_heads: config.n_heads || 8,
                vocab_size: config.vocab_size || 50304,
                max_seq_len: config.max_seq_len || 512
              },
              weights_url: `/crown/browser/models/${modelId}`
            });
          } catch (error) {
            console.error(`[BrowserAPI] Error loading model ${file}:`, error.message);
          }
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ models }));
  }

  /**
   * GET /crown/browser/models/:id
   * Get full model data for loading
   */
  async getModel(modelId, req, res) {
    const filePath = path.join(this.modelsPath, `${modelId}.json`);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Model not found' }));
      return;
    }

    try {
      const modelData = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(modelData);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * GET /crown/browser/crowns
   * List all available Crowns for browser dropdown
   */
  async listCrowns(req, res) {
    const crowns = [];

    // Scan crowns directory
    if (fs.existsSync(this.crownsPath)) {
      const files = fs.readdirSync(this.crownsPath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.crownsPath, file);
            const crownData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

            const crownId = file.replace('.json', '');
            const config = crownData.config || {};

            crowns.push({
              id: crownId,
              name: crownData.name || crownId,
              type: crownData.type || 'character-role',
              personality: config.personality || 'neutral',
              temperature: config.temperature || 0.7,
              specializations: config.specializations || [],
              systemPrompt: config.systemPrompt ? config.systemPrompt.substring(0, 100) + '...' : '',
              knowledge_summary: this._getKnowledgeSummary(crownData.knowledge)
            });
          } catch (error) {
            console.error(`[BrowserAPI] Error loading Crown ${file}:`, error.message);
          }
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ crowns }));
  }

  /**
   * GET /crown/browser/crowns/:id
   * Get full Crown data for loading
   */
  async getCrown(crownId, req, res) {
    const filePath = path.join(this.crownsPath, `${crownId}.json`);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Crown not found' }));
      return;
    }

    try {
      const crownData = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(crownData);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * GET /crown/browser/agents
   * List all pre-configured agents (model + crown combos)
   */
  async listAgents(req, res) {
    const agents = [];

    // Scan agent configurations
    if (fs.existsSync(this.agentsPath)) {
      const files = fs.readdirSync(this.agentsPath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(this.agentsPath, file);
            const agentData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

            const agentId = file.replace('.json', '');

            agents.push({
              id: agentId,
              name: agentData.name || agentId,
              model: agentData.model || null,
              crown: agentData.crown || null,
              config: agentData.config || {}
            });
          } catch (error) {
            console.error(`[BrowserAPI] Error loading agent ${file}:`, error.message);
          }
        }
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents }));
  }

  /**
   * GET /crown/browser/agents/:id
   * Get full agent configuration
   */
  async getAgent(agentId, req, res) {
    const filePath = path.join(this.agentsPath, `${agentId}.json`);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Agent not found' }));
      return;
    }

    try {
      const agentData = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(agentData);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  /**
   * Get file size in human-readable format
   */
  _getFileSize(filePath) {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;

    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
    return Math.round(bytes / 1024 / 1024) + 'MB';
  }

  /**
   * Get knowledge summary from Crown
   */
  _getKnowledgeSummary(knowledge) {
    if (!knowledge) return 'No knowledge';

    const docs = knowledge.documents?.length || 0;
    const code = knowledge.code?.length || 0;
    const data = knowledge.data?.length || 0;

    const parts = [];
    if (docs > 0) parts.push(`${docs} docs`);
    if (code > 0) parts.push(`${code} code`);
    if (data > 0) parts.push(`${data} data`);

    return parts.length > 0 ? parts.join(', ') : 'No knowledge';
  }
}

// Export singleton instance
export const browserAPI = new BrowserAPI();

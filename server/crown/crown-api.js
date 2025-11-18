/**
 * Crown API
 * HTTP endpoints for Crown management, model upload, and agent creation
 */

import { CrownBuilder } from './crown-builder.js';
import { CrownLoader } from './crown-loader.js';
import { ModelManager } from './model-manager.js';
import formidable from 'formidable';
import path from 'path';
import { promises as fs } from 'fs';

export class CrownAPI {
  constructor() {
    this.crownBuilder = new CrownBuilder();
    this.crownLoader = new CrownLoader();
    this.modelManager = new ModelManager();
  }

  /**
   * Handle Crown/Model API requests
   */
  async handleRequest(req, res, url) {
    const endpoint = url.pathname.replace('/crown/', '');

    try {
      switch (endpoint) {
        // Crown management
        case 'build':
          await this.buildCrown(req, res);
          break;

        case 'upload':
          await this.uploadCrownData(req, res);
          break;

        case 'list':
          await this.listCrowns(req, res);
          break;

        case 'load':
          await this.loadCrown(req, res);
          break;

        case 'context':
          await this.getCrownContext(req, res);
          break;

        // Model management
        case 'models/list':
          await this.listModels(req, res);
          break;

        case 'models/upload':
          await this.uploadModel(req, res);
          break;

        case 'models/delete':
          await this.deleteModel(req, res);
          break;

        // Agent management
        case 'agents/create':
          await this.createAgent(req, res);
          break;

        case 'agents/list':
          await this.listAgents(req, res);
          break;

        case 'agents/get':
          await this.getAgent(req, res);
          break;

        // Fine-tuning
        case 'finetune':
          await this.fineTuneModel(req, res);
          break;

        default:
          this.respondJSON(res, 404, { error: 'Crown endpoint not found' });
      }
    } catch (err) {
      console.error('[Crown API] Error:', err);
      this.respondJSON(res, 500, { error: err.message });
    }
  }

  /**
   * Build Crown from uploaded files
   */
  async buildCrown(req, res) {
    const body = await this.readBody(req);
    const { name, directory, options } = JSON.parse(body);

    const result = await this.crownBuilder.buildFromDirectory(directory, name, options);

    // Save Crown
    const outputPath = path.join(process.cwd(), 'examples', 'crowns', `${name}.json`);
    await this.crownBuilder.saveCrown(result.crown, result.compressed, outputPath);

    this.respondJSON(res, 200, {
      message: 'Crown built successfully',
      crown: result.crown.name,
      stats: result.stats,
      path: outputPath
    });
  }

  /**
   * Upload Crown data files
   */
  async uploadCrownData(req, res) {
    const form = formidable({
      multiples: true,
      keepExtensions: true,
      maxFileSize: 100 * 1024 * 1024 // 100MB
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        this.respondJSON(res, 500, { error: err.message });
        return;
      }

      const crownName = fields.crownName || 'uploaded-crown';
      const uploadedFiles = [];

      // Process uploaded files
      for (const [key, file] of Object.entries(files)) {
        const fileArray = Array.isArray(file) ? file : [file];

        for (const f of fileArray) {
          uploadedFiles.push({
            name: f.originalFilename,
            path: f.filepath,
            size: f.size,
            type: f.mimetype
          });
        }
      }

      // Build Crown from uploaded files
      // For now, return upload confirmation
      this.respondJSON(res, 200, {
        message: 'Files uploaded successfully',
        crownName,
        files: uploadedFiles.length,
        filesUploaded: uploadedFiles
      });
    });
  }

  /**
   * List all Crowns
   */
  async listCrowns(req, res) {
    const crowns = this.crownLoader.listCrowns();
    this.respondJSON(res, 200, { crowns });
  }

  /**
   * Load Crown
   */
  async loadCrown(req, res) {
    const body = await this.readBody(req);
    const { crownName, crownPath } = JSON.parse(body);

    let path = crownPath;
    if (!path && crownName) {
      path = `examples/crowns/${crownName}.json`;
    }

    const crown = await this.crownLoader.loadCrown(path);

    this.respondJSON(res, 200, {
      message: 'Crown loaded',
      crown: crown.name,
      version: crown.version,
      type: crown.type
    });
  }

  /**
   * Get Crown context
   */
  async getCrownContext(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const crownName = url.searchParams.get('name');

    const context = this.crownLoader.getCrownContext(crownName);

    this.respondJSON(res, 200, {
      crown: crownName,
      context,
      length: context.length
    });
  }

  /**
   * List all models
   */
  async listModels(req, res) {
    const models = this.modelManager.listModels();
    this.respondJSON(res, 200, { models });
  }

  /**
   * Upload model files
   */
  async uploadModel(req, res) {
    const form = formidable({
      multiples: true,
      keepExtensions: true,
      maxFileSize: 500 * 1024 * 1024 // 500MB for models
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        this.respondJSON(res, 500, { error: err.message });
        return;
      }

      const modelName = fields.modelName;
      const modelType = fields.modelType || 'custom';

      const uploadedFiles = [];

      // Read file data
      for (const [key, file] of Object.entries(files)) {
        const fileArray = Array.isArray(file) ? file : [file];

        for (const f of fileArray) {
          const data = await fs.readFile(f.filepath);

          uploadedFiles.push({
            name: f.originalFilename,
            data,
            size: f.size
          });
        }
      }

      // Add model
      const model = await this.modelManager.addModel(
        modelName,
        uploadedFiles,
        modelType,
        fields
      );

      this.respondJSON(res, 200, {
        message: 'Model uploaded successfully',
        model
      });
    });
  }

  /**
   * Delete model
   */
  async deleteModel(req, res) {
    const body = await this.readBody(req);
    const { modelName } = JSON.parse(body);

    await this.modelManager.deleteModel(modelName);

    this.respondJSON(res, 200, {
      message: 'Model deleted',
      modelName
    });
  }

  /**
   * Create agent
   */
  async createAgent(req, res) {
    const body = await this.readBody(req);
    const { agentName, modelName, crownName, options } = JSON.parse(body);

    const agent = await this.modelManager.createAgent(
      agentName,
      modelName,
      crownName,
      options
    );

    this.respondJSON(res, 200, {
      message: 'Agent created successfully',
      agent
    });
  }

  /**
   * List all agents
   */
  async listAgents(req, res) {
    const agents = await this.modelManager.listAgents();
    this.respondJSON(res, 200, { agents });
  }

  /**
   * Get agent configuration
   */
  async getAgent(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const agentName = url.searchParams.get('name');

    const agent = await this.modelManager.loadAgent(agentName);

    this.respondJSON(res, 200, { agent });
  }

  /**
   * Fine-tune Ollama model with Crown
   */
  async fineTuneModel(req, res) {
    const body = await this.readBody(req);
    const { baseModel, crownName, newModelName } = JSON.parse(body);

    const result = await this.modelManager.fineTuneWithCrown(
      baseModel,
      crownName,
      newModelName
    );

    this.respondJSON(res, 200, {
      message: 'Modelfile generated for fine-tuning',
      ...result
    });
  }

  // Utility functions
  respondJSON(res, status, data) {
    const json = JSON.stringify(data, null, 2);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(json)
    });
    res.end(json);
  }

  async readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}

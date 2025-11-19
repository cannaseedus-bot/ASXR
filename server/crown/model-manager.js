/**
 * Model Manager
 * Manages uploaded models and agent creation
 * Supports Ollama, Qwen, Cline, and custom models
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CrownLoader } from './crown-loader.js';
import { GitHubIntegration } from './github-integration.js';
import { HuggingFaceIntegration } from './huggingface-integration.js';
import { ColabIntegration } from './colab-integration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '../..');

export class ModelManager {
  constructor() {
    this.modelsDir = path.join(ROOT_DIR, 'agents');
    this.models = new Map();
    this.crownLoader = new CrownLoader();

    // Integrations
    this.github = new GitHubIntegration(this.modelsDir);
    this.huggingface = new HuggingFaceIntegration(this.modelsDir);
    this.colab = new ColabIntegration();

    this.initializeModels();
  }

  /**
   * Initialize and detect existing models
   */
  async initializeModels() {
    console.log('[Models] Initializing model manager...');

    try {
      await fs.mkdir(this.modelsDir, { recursive: true });

      // Detect existing agent directories
      const agentDirs = await fs.readdir(this.modelsDir);

      for (const dir of agentDirs) {
        const agentPath = path.join(this.modelsDir, dir);
        const stat = await fs.stat(agentPath);

        if (stat.isDirectory()) {
          await this.detectModel(dir, agentPath);
        }
      }

      console.log(`[Models] Detected ${this.models.size} models`);
    } catch (err) {
      console.error('[Models] Initialization error:', err);
    }
  }

  /**
   * Detect model type from directory structure
   */
  async detectModel(name, modelPath) {
    try {
      const files = await fs.readdir(modelPath);

      let modelInfo = {
        name,
        path: modelPath,
        type: 'unknown',
        files: [],
        detected: new Date().toISOString()
      };

      // Detect Qwen model (safetensors, config.json, tokenizer)
      if (files.includes('model.safetensors') && files.includes('config.json')) {
        modelInfo.type = 'qwen';
        modelInfo.framework = 'transformers';

        // Read config
        try {
          const config = JSON.parse(
            await fs.readFile(path.join(modelPath, 'config.json'), 'utf8')
          );
          modelInfo.config = config;
          modelInfo.architecture = config.architectures?.[0];
        } catch {}
      }

      // Detect Cline (Java JARs)
      else if (files.some(f => f.endsWith('.jar'))) {
        modelInfo.type = 'cline';
        modelInfo.framework = 'java';

        const libDir = path.join(modelPath, 'lib');
        if (await this.exists(libDir)) {
          const jars = await fs.readdir(libDir);
          modelInfo.jars = jars.filter(f => f.endsWith('.jar'));
        }
      }

      // Detect GGUF models (for llama.cpp)
      else if (files.some(f => f.endsWith('.gguf'))) {
        modelInfo.type = 'gguf';
        modelInfo.framework = 'llama.cpp';
      }

      // Detect ONNX models
      else if (files.some(f => f.endsWith('.onnx'))) {
        modelInfo.type = 'onnx';
        modelInfo.framework = 'onnx';
      }

      modelInfo.files = files;

      this.models.set(name, modelInfo);
      console.log(`[Models] Detected ${modelInfo.type} model: ${name}`);

      return modelInfo;
    } catch (err) {
      console.error(`[Models] Error detecting ${name}:`, err.message);
      return null;
    }
  }

  /**
   * Add new model from upload
   */
  async addModel(modelName, files, modelType, options = {}) {
    console.log(`[Models] Adding new ${modelType} model: ${modelName}`);

    const modelPath = path.join(this.modelsDir, modelName);
    await fs.mkdir(modelPath, { recursive: true });

    // Save uploaded files
    const savedFiles = [];
    for (const file of files) {
      const filePath = path.join(modelPath, file.name);

      // Create subdirectories if needed
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      await fs.writeFile(filePath, file.data);
      savedFiles.push(file.name);

      console.log(`[Models] Saved ${file.name}`);
    }

    // Detect and register model
    const modelInfo = await this.detectModel(modelName, modelPath);

    // Add metadata
    const metadata = {
      ...modelInfo,
      uploadedAt: new Date().toISOString(),
      uploadedFiles: savedFiles,
      userOptions: options
    };

    await fs.writeFile(
      path.join(modelPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    return metadata;
  }

  /**
   * Create agent from model + Crown
   */
  async createAgent(agentName, modelName, crownName, options = {}) {
    console.log(`[Models] Creating agent "${agentName}" with model:${modelName} crown:${crownName}`);

    const model = this.models.get(modelName);
    if (!model) {
      throw new Error(`Model not found: ${modelName}`);
    }

    // Load Crown
    let crownData = null;
    if (crownName) {
      const crownPath = path.join(ROOT_DIR, 'examples', 'crowns', `${crownName}.json`);
      try {
        crownData = await this.crownLoader.loadCrown(crownPath);
      } catch (err) {
        console.warn(`[Models] Could not load Crown ${crownName}:`, err.message);
      }
    }

    const agent = {
      name: agentName,
      model: modelName,
      modelType: model.type,
      crown: crownName,
      created: new Date().toISOString(),
      config: {
        temperature: options.temperature || crownData?.config?.temperature || 0.7,
        systemPrompt: options.systemPrompt || crownData?.config?.systemPrompt || '',
        maxTokens: options.maxTokens || 2048,
        ...options
      },
      crownContext: crownData ? this.crownLoader.getCrownContext(crownName) : null
    };

    // Save agent configuration
    const agentsDir = path.join(ROOT_DIR, 'agents', 'configurations');
    await fs.mkdir(agentsDir, { recursive: true });

    await fs.writeFile(
      path.join(agentsDir, `${agentName}.json`),
      JSON.stringify(agent, null, 2)
    );

    console.log(`[Models] Agent "${agentName}" created successfully`);

    return agent;
  }

  /**
   * Clone GitHub repository as model/shard
   */
  async cloneGitHubRepo(repoUrl, options = {}) {
    const shard = await this.github.cloneRepo(repoUrl, options);

    // Add to models registry
    this.models.set(shard.id, {
      name: shard.id,
      type: 'github-repo',
      path: shard.path,
      ...shard
    });

    return shard;
  }

  /**
   * Download HuggingFace model
   */
  async downloadHuggingFaceModel(modelId, options = {}) {
    const shard = await this.huggingface.downloadModel(modelId, options);

    // Add to models registry
    this.models.set(shard.id, {
      name: shard.id,
      type: 'huggingface',
      path: shard.path,
      ...shard
    });

    return shard;
  }

  /**
   * Generate Colab notebook for fine-tuning
   */
  async generateColabNotebook(crownName, modelId, options = {}) {
    const notebook = await this.colab.generateFineTuningNotebook(
      crownName,
      modelId,
      options
    );

    const outputPath = path.join(
      this.modelsDir,
      'colab',
      `finetune-${modelId.replace('/', '-')}-${crownName}.ipynb`
    );

    await this.colab.saveNotebook(notebook, outputPath);

    return {
      notebook,
      path: outputPath,
      colabUrl: this.colab.generateColabUrl(outputPath)
    };
  }

  /**
   * List all models (including GitHub & HuggingFace)
   */
  async listModels() {
    const localModels = Array.from(this.models.values());

    // Include GitHub repos
    const githubRepos = await this.github.listRepos();

    // Include HuggingFace models
    const hfModels = await this.huggingface.listModels();

    return [...localModels, ...githubRepos, ...hfModels];
  }

  /**
   * Get model info
   */
  getModel(modelName) {
    return this.models.get(modelName);
  }

  /**
   * Delete model
   */
  async deleteModel(modelName) {
    const model = this.models.get(modelName);
    if (!model) {
      throw new Error(`Model not found: ${modelName}`);
    }

    await this.rmdir(model.path);
    this.models.delete(modelName);

    console.log(`[Models] Deleted model: ${modelName}`);
  }

  /**
   * Load agent configuration
   */
  async loadAgent(agentName) {
    const agentPath = path.join(ROOT_DIR, 'agents', 'configurations', `${agentName}.json`);

    const config = JSON.parse(await fs.readFile(agentPath, 'utf8'));

    return config;
  }

  /**
   * List all agents
   */
  async listAgents() {
    const agentsDir = path.join(ROOT_DIR, 'agents', 'configurations');

    try {
      await fs.mkdir(agentsDir, { recursive: true });
      const files = await fs.readdir(agentsDir);

      const agents = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const config = await this.loadAgent(file.replace('.json', ''));
          agents.push(config);
        }
      }

      return agents;
    } catch (err) {
      return [];
    }
  }

  /**
   * Fine-tune Ollama model with Crown data
   */
  async fineTuneWithCrown(baseModel, crownName, newModelName) {
    console.log(`[Models] Fine-tuning ${baseModel} with Crown ${crownName}...`);

    // Load Crown
    const crownPath = path.join(ROOT_DIR, 'examples', 'crowns', `${crownName}.json`);
    const crownData = await this.crownLoader.loadCrown(crownPath);

    // Generate training data
    const trainingData = this.generateTrainingData(crownData);

    // Create Modelfile for Ollama
    const modelfile = this.generateOllamaModelfile(baseModel, crownData, trainingData);

    // Save Modelfile
    const modelfilePath = path.join(this.modelsDir, 'ollama', `${newModelName}.Modelfile`);
    await fs.mkdir(path.dirname(modelfilePath), { recursive: true });
    await fs.writeFile(modelfilePath, modelfile);

    console.log(`[Models] Modelfile created: ${modelfilePath}`);
    console.log(`[Models] To create the model, run:`);
    console.log(`  ollama create ${newModelName} -f ${modelfilePath}`);

    return {
      modelfile: modelfilePath,
      command: `ollama create ${newModelName} -f ${modelfilePath}`,
      trainingExamples: trainingData.length
    };
  }

  /**
   * Generate training data from Crown
   */
  generateTrainingData(crown) {
    const data = [];

    // Documents → Q&A pairs
    if (crown.knowledge?.documents) {
      crown.knowledge.documents.forEach(doc => {
        data.push({
          prompt: `Explain ${doc.name}`,
          response: doc.content
        });
      });
    }

    // Code → Examples
    if (crown.knowledge?.code) {
      crown.knowledge.code.forEach(code => {
        data.push({
          prompt: `Write ${code.type} code for ${code.name}`,
          response: code.content
        });
      });
    }

    // Fine-tuning conversations
    if (crown.fineTuning?.conversations) {
      data.push(...crown.fineTuning.conversations);
    }

    return data;
  }

  /**
   * Generate Ollama Modelfile with Crown data
   */
  generateOllamaModelfile(baseModel, crown, trainingData) {
    let modelfile = `FROM ${baseModel}\n\n`;

    // System prompt from Crown
    if (crown.config?.systemPrompt) {
      modelfile += `SYSTEM """\n${crown.config.systemPrompt}\n"""\n\n`;
    }

    // Parameters
    modelfile += `PARAMETER temperature ${crown.config?.temperature || 0.7}\n`;

    if (crown.config?.maxTokens) {
      modelfile += `PARAMETER num_ctx ${crown.config.maxTokens}\n`;
    }

    // Add knowledge as system context
    const context = this.crownLoader.getCrownContext(crown.name);
    if (context) {
      modelfile += `\nSYSTEM """\n${context}\n"""\n`;
    }

    // Add training examples as MESSAGE pairs
    if (trainingData.length > 0) {
      modelfile += `\n# Training Examples\n`;
      trainingData.slice(0, 10).forEach(example => {
        modelfile += `MESSAGE user "${example.prompt}"\n`;
        modelfile += `MESSAGE assistant "${example.response}"\n`;
      });
    }

    return modelfile;
  }

  // Utility functions
  async exists(path) {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async rmdir(dir) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

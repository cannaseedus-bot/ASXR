/**
 * HuggingFace Integration
 * Download models from HuggingFace Hub
 * Convert to Multi-Hive shards
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class HuggingFaceIntegration {
  constructor(modelsDir) {
    this.modelsDir = modelsDir;
    this.downloadedModels = new Map();
  }

  /**
   * Download model from HuggingFace
   */
  async downloadModel(modelId, options = {}) {
    console.log(`[HuggingFace] Downloading ${modelId}...`);

    const modelName = modelId.replace('/', '--');
    const targetDir = path.join(this.modelsDir, 'huggingface', modelName);

    // Check if already downloaded
    if (await this.exists(targetDir) && !options.force) {
      console.log(`[HuggingFace] Model already exists: ${modelName}`);
      return await this.loadModelShard(targetDir, modelId);
    }

    // Create target directory
    await fs.mkdir(targetDir, { recursive: true });

    try {
      // Use huggingface-cli or git-lfs clone
      const downloadMethod = options.method || 'auto';

      if (downloadMethod === 'cli' || downloadMethod === 'auto') {
        // Try huggingface-cli first
        try {
          const cmd = `huggingface-cli download ${modelId} --local-dir "${targetDir}"`;
          await execAsync(cmd);
          console.log(`[HuggingFace] Downloaded ${modelId} via CLI`);
        } catch (err) {
          // Fall back to git-lfs
          console.log(`[HuggingFace] CLI failed, trying git-lfs...`);
          await this.downloadViaGit(modelId, targetDir);
        }
      } else if (downloadMethod === 'git') {
        await this.downloadViaGit(modelId, targetDir);
      }

      // Convert to shard
      const shard = await this.modelToShard(targetDir, modelId);

      this.downloadedModels.set(modelName, {
        id: modelId,
        path: targetDir,
        shard,
        downloadedAt: new Date().toISOString()
      });

      return shard;
    } catch (err) {
      console.error(`[HuggingFace] Download failed:`, err.message);
      throw new Error(`Failed to download ${modelId}: ${err.message}`);
    }
  }

  /**
   * Download via git-lfs
   */
  async downloadViaGit(modelId, targetDir) {
    const repoUrl = `https://huggingface.co/${modelId}`;

    // Check if git-lfs is installed
    try {
      await execAsync('git lfs version');
    } catch {
      throw new Error('git-lfs not installed. Install with: git lfs install');
    }

    const cmd = `git clone ${repoUrl} "${targetDir}"`;
    await execAsync(cmd);

    console.log(`[HuggingFace] Downloaded ${modelId} via git-lfs`);
  }

  /**
   * Convert HuggingFace model to shard
   */
  async modelToShard(modelPath, modelId) {
    console.log(`[HuggingFace] Converting ${modelId} to shard...`);

    // Analyze model
    const analysis = await this.analyzeModel(modelPath);

    // Create shard definition
    const shard = {
      id: modelId.replace('/', '--'),
      source: 'huggingface',
      modelId,
      path: modelPath,
      type: analysis.type,
      port: 3000 + Math.floor(Math.random() * 1000),
      runtime: 'kuhul',

      // API endpoints for model inference
      api: [
        {
          path: '/info',
          method: 'GET',
          handler: 'get_model_info'
        },
        {
          path: '/generate',
          method: 'POST',
          handler: 'generate_text'
        },
        {
          path: '/embed',
          method: 'POST',
          handler: 'create_embeddings'
        },
        {
          path: '/chat',
          method: 'POST',
          handler: 'chat_completion'
        }
      ],

      // Model metadata
      metadata: {
        framework: analysis.framework,
        modelType: analysis.modelType,
        size: analysis.size,
        files: analysis.files,
        hasTokenizer: analysis.hasTokenizer,
        hasConfig: analysis.hasConfig
      },

      created: new Date().toISOString()
    };

    // Save shard definition
    await fs.writeFile(
      path.join(modelPath, '.shard.json'),
      JSON.stringify(shard, null, 2)
    );

    return shard;
  }

  /**
   * Analyze HuggingFace model
   */
  async analyzeModel(modelPath) {
    const analysis = {
      type: 'ml-model',
      framework: 'unknown',
      modelType: 'unknown',
      size: 0,
      files: [],
      hasTokenizer: false,
      hasConfig: false
    };

    try {
      const files = await fs.readdir(modelPath);
      analysis.files = files;

      // Detect framework
      if (files.includes('pytorch_model.bin') || files.some(f => f.endsWith('.safetensors'))) {
        analysis.framework = 'pytorch';
      } else if (files.includes('tf_model.h5')) {
        analysis.framework = 'tensorflow';
      } else if (files.some(f => f.endsWith('.onnx'))) {
        analysis.framework = 'onnx';
      } else if (files.some(f => f.endsWith('.gguf'))) {
        analysis.framework = 'gguf';
      }

      // Detect model type
      if (files.includes('config.json')) {
        analysis.hasConfig = true;

        const config = JSON.parse(
          await fs.readFile(path.join(modelPath, 'config.json'), 'utf8')
        );

        analysis.modelType = config.model_type || 'unknown';

        // Common model types
        if (config.architectures) {
          const arch = config.architectures[0];

          if (arch.includes('ForCausalLM')) {
            analysis.type = 'text-generation';
          } else if (arch.includes('ForSequenceClassification')) {
            analysis.type = 'text-classification';
          } else if (arch.includes('ForQuestionAnswering')) {
            analysis.type = 'question-answering';
          } else if (arch.includes('VisionModel')) {
            analysis.type = 'image-model';
          }
        }
      }

      // Check for tokenizer
      if (files.includes('tokenizer.json') || files.includes('tokenizer_config.json')) {
        analysis.hasTokenizer = true;
      }

      // Calculate size
      for (const file of files) {
        const filePath = path.join(modelPath, file);
        try {
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            analysis.size += stat.size;
          }
        } catch {}
      }

    } catch (err) {
      console.error(`[HuggingFace] Analysis error:`, err.message);
    }

    return analysis;
  }

  /**
   * List downloaded models
   */
  async listModels() {
    const hfDir = path.join(this.modelsDir, 'huggingface');

    if (!await this.exists(hfDir)) {
      return [];
    }

    const dirs = await fs.readdir(hfDir);
    const models = [];

    for (const dir of dirs) {
      const modelPath = path.join(hfDir, dir);
      const shard = await this.loadModelShard(modelPath, dir);

      if (shard) {
        models.push(shard);
      }
    }

    return models;
  }

  /**
   * Load model shard from disk
   */
  async loadModelShard(modelPath, modelId) {
    const shardFile = path.join(modelPath, '.shard.json');

    if (await this.exists(shardFile)) {
      const shard = JSON.parse(await fs.readFile(shardFile, 'utf8'));
      return shard;
    }

    // If no shard file, create one
    return await this.modelToShard(modelPath, modelId);
  }

  /**
   * Delete downloaded model
   */
  async deleteModel(modelId) {
    const modelName = modelId.replace('/', '--');
    const model = this.downloadedModels.get(modelName);

    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    await fs.rm(model.path, { recursive: true, force: true });
    this.downloadedModels.delete(modelName);

    console.log(`[HuggingFace] Deleted ${modelId}`);
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
}

/**
 * Popular HuggingFace Models Registry
 */
export const POPULAR_HF_MODELS = [
  // Text Generation - Small
  {
    id: 'meta-llama/Llama-2-7b-hf',
    name: 'Llama 2 7B',
    category: 'text-generation',
    size: '7B',
    description: 'Meta Llama 2 7B model'
  },

  {
    id: 'mistralai/Mistral-7B-v0.1',
    name: 'Mistral 7B',
    category: 'text-generation',
    size: '7B',
    description: 'Mistral AI 7B model'
  },

  // Text Generation - Medium
  {
    id: 'meta-llama/Llama-2-13b-hf',
    name: 'Llama 2 13B',
    category: 'text-generation',
    size: '13B',
    description: 'Meta Llama 2 13B model'
  },

  // Code Generation
  {
    id: 'codellama/CodeLlama-7b-hf',
    name: 'Code Llama 7B',
    category: 'code-generation',
    size: '7B',
    description: 'Meta Code Llama model'
  },

  {
    id: 'WizardLM/WizardCoder-15B-V1.0',
    name: 'WizardCoder 15B',
    category: 'code-generation',
    size: '15B',
    description: 'WizardCoder for code generation'
  },

  // Small & Fast
  {
    id: 'microsoft/phi-2',
    name: 'Phi-2',
    category: 'text-generation',
    size: '2.7B',
    description: 'Microsoft Phi-2 small model'
  },

  {
    id: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
    name: 'TinyLlama',
    category: 'text-generation',
    size: '1.1B',
    description: 'Tiny but capable LLM'
  },

  // Embeddings
  {
    id: 'sentence-transformers/all-MiniLM-L6-v2',
    name: 'MiniLM Embeddings',
    category: 'embeddings',
    size: '22M',
    description: 'Fast sentence embeddings'
  },

  {
    id: 'BAAI/bge-small-en-v1.5',
    name: 'BGE Embeddings',
    category: 'embeddings',
    size: '33M',
    description: 'BAAI general embeddings'
  },

  // Vision
  {
    id: 'openai/clip-vit-base-patch32',
    name: 'CLIP',
    category: 'multimodal',
    size: '151M',
    description: 'OpenAI CLIP vision model'
  },

  {
    id: 'llava-hf/llava-1.5-7b-hf',
    name: 'LLaVA 1.5 7B',
    category: 'multimodal',
    size: '7B',
    description: 'Large Language and Vision Assistant'
  },

  // Stable Diffusion
  {
    id: 'stabilityai/stable-diffusion-2-1',
    name: 'Stable Diffusion 2.1',
    category: 'image-generation',
    size: '900M',
    description: 'Stability AI image generation'
  },

  {
    id: 'stabilityai/stable-diffusion-xl-base-1.0',
    name: 'SDXL 1.0',
    category: 'image-generation',
    size: '6.9B',
    description: 'Stable Diffusion XL'
  },

  // Whisper (Speech)
  {
    id: 'openai/whisper-base',
    name: 'Whisper Base',
    category: 'speech-to-text',
    size: '74M',
    description: 'OpenAI Whisper STT'
  },

  // GGUF (for llama.cpp)
  {
    id: 'TheBloke/Llama-2-7B-GGUF',
    name: 'Llama 2 7B GGUF',
    category: 'text-generation',
    size: '7B',
    description: 'Llama 2 in GGUF format'
  },

  {
    id: 'TheBloke/Mistral-7B-Instruct-v0.2-GGUF',
    name: 'Mistral 7B GGUF',
    category: 'text-generation',
    size: '7B',
    description: 'Mistral in GGUF format'
  }
];

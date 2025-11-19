/**
 * GitHub Integration
 * Clone GitHub repositories as models/shards
 * Convert repos to virtual shards in the Multi-Hive
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class GitHubIntegration {
  constructor(modelsDir) {
    this.modelsDir = modelsDir;
    this.clonedRepos = new Map();
  }

  /**
   * Clone GitHub repository as a model/shard
   */
  async cloneRepo(repoUrl, options = {}) {
    console.log(`[GitHub] Cloning ${repoUrl}...`);

    // Extract repo name
    const repoName = this.extractRepoName(repoUrl);
    const targetDir = path.join(this.modelsDir, 'github', repoName);

    // Check if already cloned
    if (await this.exists(targetDir) && !options.force) {
      console.log(`[GitHub] Repository already exists: ${repoName}`);
      return await this.loadRepoShard(targetDir, repoName);
    }

    // Clone repository
    try {
      await fs.mkdir(path.dirname(targetDir), { recursive: true });

      const cloneCmd = `git clone ${repoUrl} "${targetDir}"`;
      const { stdout, stderr } = await execAsync(cloneCmd);

      console.log(`[GitHub] Cloned ${repoName}`);

      // Convert to shard
      const shard = await this.repoToShard(targetDir, repoName, repoUrl);

      this.clonedRepos.set(repoName, {
        url: repoUrl,
        path: targetDir,
        shard,
        clonedAt: new Date().toISOString()
      });

      return shard;
    } catch (err) {
      console.error(`[GitHub] Clone failed:`, err.message);
      throw new Error(`Failed to clone ${repoUrl}: ${err.message}`);
    }
  }

  /**
   * Convert GitHub repo to Multi-Hive shard
   */
  async repoToShard(repoPath, repoName, repoUrl) {
    console.log(`[GitHub] Converting ${repoName} to shard...`);

    // Analyze repository
    const analysis = await this.analyzeRepo(repoPath);

    // Create shard definition
    const shard = {
      id: repoName,
      source: 'github',
      url: repoUrl,
      path: repoPath,
      type: analysis.type,
      port: 3000 + Math.floor(Math.random() * 1000),
      runtime: 'kuhul',

      // API endpoints based on repo structure
      api: this.generateAPIFromRepo(analysis),

      // Metadata
      metadata: {
        language: analysis.primaryLanguage,
        frameworks: analysis.frameworks,
        hasTests: analysis.hasTests,
        hasDocs: analysis.hasDocs,
        fileCount: analysis.fileCount,
        size: analysis.size
      },

      // View (if web-based)
      view: analysis.hasWebInterface ? {
        html: {
          body: {
            node: 'iframe',
            attrs: { src: `file://${repoPath}/index.html` }
          }
        }
      } : null,

      created: new Date().toISOString()
    };

    // Save shard definition
    await fs.writeFile(
      path.join(repoPath, '.shard.json'),
      JSON.stringify(shard, null, 2)
    );

    return shard;
  }

  /**
   * Analyze repository structure
   */
  async analyzeRepo(repoPath) {
    const analysis = {
      type: 'unknown',
      primaryLanguage: null,
      frameworks: [],
      hasTests: false,
      hasDocs: false,
      hasWebInterface: false,
      fileCount: 0,
      size: 0
    };

    try {
      // Get all files
      const files = await this.getAllFiles(repoPath);
      analysis.fileCount = files.length;

      // Detect language
      const extensions = files.map(f => path.extname(f).slice(1));
      const langCounts = {};
      extensions.forEach(ext => {
        langCounts[ext] = (langCounts[ext] || 0) + 1;
      });

      const sortedLangs = Object.entries(langCounts)
        .sort((a, b) => b[1] - a[1]);

      if (sortedLangs.length > 0) {
        const primaryExt = sortedLangs[0][0];
        analysis.primaryLanguage = this.extToLanguage(primaryExt);
      }

      // Detect frameworks
      if (await this.exists(path.join(repoPath, 'package.json'))) {
        const pkg = JSON.parse(
          await fs.readFile(path.join(repoPath, 'package.json'), 'utf8')
        );
        analysis.frameworks.push('node.js');

        if (pkg.dependencies?.react) analysis.frameworks.push('react');
        if (pkg.dependencies?.vue) analysis.frameworks.push('vue');
        if (pkg.dependencies?.express) analysis.frameworks.push('express');
      }

      if (await this.exists(path.join(repoPath, 'requirements.txt'))) {
        analysis.frameworks.push('python');
      }

      if (await this.exists(path.join(repoPath, 'Cargo.toml'))) {
        analysis.frameworks.push('rust');
      }

      // Detect tests
      const testPatterns = ['test/', 'tests/', '__tests__/', 'spec/'];
      analysis.hasTests = files.some(f =>
        testPatterns.some(pattern => f.includes(pattern))
      );

      // Detect docs
      const docPatterns = ['README.md', 'docs/', 'documentation/'];
      analysis.hasDocs = files.some(f =>
        docPatterns.some(pattern => f.includes(pattern))
      );

      // Detect web interface
      analysis.hasWebInterface = files.some(f =>
        f.endsWith('index.html') || f.endsWith('index.htm')
      );

      // Detect type
      if (analysis.frameworks.includes('react') || analysis.frameworks.includes('vue')) {
        analysis.type = 'web-app';
      } else if (analysis.frameworks.includes('express')) {
        analysis.type = 'api-server';
      } else if (analysis.primaryLanguage === 'python') {
        analysis.type = 'ml-model';
      } else if (files.some(f => f.includes('.jar'))) {
        analysis.type = 'java-agent';
      } else {
        analysis.type = 'library';
      }

      // Calculate size
      for (const file of files) {
        const stat = await fs.stat(file);
        analysis.size += stat.size;
      }

    } catch (err) {
      console.error(`[GitHub] Analysis error:`, err.message);
    }

    return analysis;
  }

  /**
   * Generate API endpoints from repo analysis
   */
  generateAPIFromRepo(analysis) {
    const api = [];

    // Default endpoints
    api.push({
      path: '/info',
      method: 'GET',
      handler: 'get_repo_info'
    });

    api.push({
      path: '/files',
      method: 'GET',
      handler: 'list_files'
    });

    // Type-specific endpoints
    if (analysis.type === 'api-server') {
      api.push({
        path: '/proxy/*',
        method: 'ALL',
        handler: 'proxy_to_server'
      });
    }

    if (analysis.type === 'ml-model') {
      api.push({
        path: '/predict',
        method: 'POST',
        handler: 'run_inference'
      });
    }

    if (analysis.type === 'java-agent') {
      api.push({
        path: '/execute',
        method: 'POST',
        handler: 'run_agent'
      });
    }

    return api;
  }

  /**
   * Update repository (git pull)
   */
  async updateRepo(repoName) {
    const repo = this.clonedRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    console.log(`[GitHub] Updating ${repoName}...`);

    const { stdout, stderr } = await execAsync(`git pull`, {
      cwd: repo.path
    });

    console.log(`[GitHub] Updated ${repoName}`);

    return { stdout, stderr };
  }

  /**
   * List cloned repositories
   */
  async listRepos() {
    const githubDir = path.join(this.modelsDir, 'github');

    if (!await this.exists(githubDir)) {
      return [];
    }

    const dirs = await fs.readdir(githubDir);
    const repos = [];

    for (const dir of dirs) {
      const repoPath = path.join(githubDir, dir);
      const shard = await this.loadRepoShard(repoPath, dir);

      if (shard) {
        repos.push(shard);
      }
    }

    return repos;
  }

  /**
   * Load repo shard from disk
   */
  async loadRepoShard(repoPath, repoName) {
    const shardFile = path.join(repoPath, '.shard.json');

    if (await this.exists(shardFile)) {
      const shard = JSON.parse(await fs.readFile(shardFile, 'utf8'));
      return shard;
    }

    // If no shard file, create one
    return await this.repoToShard(repoPath, repoName, '');
  }

  /**
   * Delete cloned repository
   */
  async deleteRepo(repoName) {
    const repo = this.clonedRepos.get(repoName);
    if (!repo) {
      throw new Error(`Repository not found: ${repoName}`);
    }

    await fs.rm(repo.path, { recursive: true, force: true });
    this.clonedRepos.delete(repoName);

    console.log(`[GitHub] Deleted ${repoName}`);
  }

  // Utility functions
  extractRepoName(url) {
    // https://github.com/owner/repo.git -> repo
    const match = url.match(/\/([^\/]+?)(?:\.git)?$/);
    return match ? match[1] : 'unknown-repo';
  }

  extToLanguage(ext) {
    const langMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'rs': 'rust',
      'go': 'go',
      'java': 'java',
      'kt': 'kotlin',
      'cpp': 'c++',
      'c': 'c',
      'rb': 'ruby',
      'php': 'php'
    };

    return langMap[ext] || ext;
  }

  async getAllFiles(dir, fileList = []) {
    const files = await fs.readdir(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);

      // Skip .git directory
      if (file === '.git' || file === 'node_modules') continue;

      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        await this.getAllFiles(filePath, fileList);
      } else {
        fileList.push(filePath);
      }
    }

    return fileList;
  }

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
 * Popular GitHub Repositories Registry
 */
export const POPULAR_REPOS = [
  // AI Agents
  {
    name: 'Cline',
    url: 'https://github.com/cline/cline.git',
    category: 'ai-agent',
    description: 'AI-powered coding assistant'
  },

  // Generative Models
  {
    name: 'Stability AI - Generative Models',
    url: 'https://github.com/Stability-AI/generative-models.git',
    category: 'ml-model',
    description: 'Stable Diffusion and generative models'
  },

  // Large Scale Training
  {
    name: 'ColossalAI',
    url: 'https://github.com/hpcaitech/ColossalAI.git',
    category: 'ml-framework',
    description: 'Large scale AI training framework'
  },

  // Conversational AI
  {
    name: 'ParlAI',
    url: 'https://github.com/facebookresearch/ParlAI.git',
    category: 'conversational-ai',
    description: 'Facebook conversational AI research platform'
  },

  // LLMs
  {
    name: 'LLaMA',
    url: 'https://github.com/facebookresearch/llama.git',
    category: 'llm',
    description: 'Meta LLaMA models'
  },

  {
    name: 'Mistral',
    url: 'https://github.com/mistralai/mistral-src.git',
    category: 'llm',
    description: 'Mistral AI models'
  },

  // Open Source LLMs
  {
    name: 'GPT4All',
    url: 'https://github.com/nomic-ai/gpt4all.git',
    category: 'llm',
    description: 'Local GPT models'
  },

  {
    name: 'LocalAI',
    url: 'https://github.com/go-skynet/LocalAI.git',
    category: 'llm-server',
    description: 'Local OpenAI-compatible API'
  },

  // Training Frameworks
  {
    name: 'DeepSpeed',
    url: 'https://github.com/microsoft/DeepSpeed.git',
    category: 'ml-framework',
    description: 'Microsoft deep learning optimization'
  },

  {
    name: 'Hugging Face Transformers',
    url: 'https://github.com/huggingface/transformers.git',
    category: 'ml-framework',
    description: 'State-of-the-art ML models'
  },

  // Multimodal
  {
    name: 'LLaVA',
    url: 'https://github.com/haotian-liu/LLaVA.git',
    category: 'multimodal',
    description: 'Large Language and Vision Assistant'
  },

  {
    name: 'CLIP',
    url: 'https://github.com/openai/CLIP.git',
    category: 'multimodal',
    description: 'OpenAI CLIP model'
  },

  // Agent Frameworks
  {
    name: 'AutoGPT',
    url: 'https://github.com/Significant-Gravitas/AutoGPT.git',
    category: 'ai-agent',
    description: 'Autonomous GPT-4 agent'
  },

  {
    name: 'LangChain',
    url: 'https://github.com/langchain-ai/langchain.git',
    category: 'ai-framework',
    description: 'Building applications with LLMs'
  },

  // Code Generation
  {
    name: 'CodeLlama',
    url: 'https://github.com/facebookresearch/codellama.git',
    category: 'code-gen',
    description: 'Code generation LLM'
  },

  {
    name: 'WizardCoder',
    url: 'https://github.com/nlpxucan/WizardLM.git',
    category: 'code-gen',
    description: 'Code-focused LLM'
  }
];

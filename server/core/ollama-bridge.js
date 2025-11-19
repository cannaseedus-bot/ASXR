/**
 * Ollama Bridge
 * Connects Multi-Hive AI Swarm to local Ollama API
 * Works with any local REST API (Ollama, LM Studio, LocalAI, etc.)
 */

export class OllamaBridge {
  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
    this.models = [];
    this.activeChats = new Map();

    console.log(`[Ollama] Bridge initialized: ${baseUrl}`);
  }

  /**
   * Check if Ollama is running
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        this.models = data.models || [];
        console.log(`[Ollama] Connected - ${this.models.length} models available`);
        return true;
      }
    } catch (err) {
      console.log(`[Ollama] Not available at ${this.baseUrl}`);
    }
    return false;
  }

  /**
   * List all available models
   */
  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data = await response.json();
      this.models = data.models || [];

      return this.models.map(m => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at,
        digest: m.digest
      }));
    } catch (err) {
      console.error('[Ollama] Error listing models:', err);
      return [];
    }
  }

  /**
   * Chat with Ollama model
   */
  async chat(model, messages, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: options.stream || false,
          ...options
        })
      });

      if (options.stream) {
        return this.handleStream(response);
      }

      const data = await response.json();
      return {
        model: data.model,
        message: data.message,
        done: data.done,
        total_duration: data.total_duration,
        load_duration: data.load_duration,
        prompt_eval_count: data.prompt_eval_count,
        eval_count: data.eval_count
      };
    } catch (err) {
      console.error('[Ollama] Chat error:', err);
      throw err;
    }
  }

  /**
   * Generate completion
   */
  async generate(model, prompt, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: options.stream || false,
          ...options
        })
      });

      if (options.stream) {
        return this.handleStream(response);
      }

      const data = await response.json();
      return {
        model: data.model,
        response: data.response,
        done: data.done,
        context: data.context,
        total_duration: data.total_duration
      };
    } catch (err) {
      console.error('[Ollama] Generate error:', err);
      throw err;
    }
  }

  /**
   * Handle streaming responses
   */
  async *handleStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            yield data;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Create embeddings
   */
  async embed(model, input) {
    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          input
        })
      });

      const data = await response.json();
      return {
        model: data.model,
        embeddings: data.embeddings
      };
    } catch (err) {
      console.error('[Ollama] Embed error:', err);
      throw err;
    }
  }

  /**
   * Pull/download a model
   */
  async pullModel(modelName, onProgress) {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (onProgress) onProgress(data);

            if (data.status === 'success') {
              console.log(`[Ollama] Model ${modelName} pulled successfully`);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (err) {
      console.error('[Ollama] Pull error:', err);
      throw err;
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName) {
    try {
      await fetch(`${this.baseUrl}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      });

      console.log(`[Ollama] Model ${modelName} deleted`);
    } catch (err) {
      console.error('[Ollama] Delete error:', err);
      throw err;
    }
  }

  /**
   * Multi-model swarm chat (parallel queries to multiple models)
   */
  async swarmChat(message, models = null, options = {}) {
    const targetModels = models || this.models.map(m => m.name).slice(0, 3);

    console.log(`[Ollama] Swarm chat with ${targetModels.length} models`);

    const promises = targetModels.map(async (model) => {
      try {
        const result = await this.chat(model, [
          { role: 'user', content: message }
        ], options);

        return {
          model,
          success: true,
          response: result.message?.content || result.response,
          stats: {
            duration: result.total_duration,
            tokens: result.eval_count
          }
        };
      } catch (err) {
        return {
          model,
          success: false,
          error: err.message
        };
      }
    });

    const results = await Promise.all(promises);

    return {
      message,
      models: targetModels,
      responses: results,
      consensus: this.buildConsensus(results)
    };
  }

  /**
   * Build consensus from multiple model responses
   */
  buildConsensus(results) {
    const successful = results.filter(r => r.success);

    if (successful.length === 0) {
      return { error: 'No successful responses' };
    }

    // Simple consensus: return response from fastest model
    const fastest = successful.sort((a, b) =>
      (a.stats?.duration || 0) - (b.stats?.duration || 0)
    )[0];

    return {
      primary: fastest.response,
      model: fastest.model,
      alternatives: successful.filter(r => r.model !== fastest.model)
        .map(r => ({ model: r.model, response: r.response }))
    };
  }

  /**
   * Connect to any local REST API (not just Ollama)
   */
  async connectToAPI(baseUrl, endpoint, method = 'GET', body = null) {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${baseUrl}${endpoint}`, options);
      const data = await response.json();

      return {
        success: true,
        status: response.status,
        data
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }
}

/**
 * LM Studio Bridge (similar to Ollama but different API)
 */
export class LMStudioBridge {
  constructor(baseUrl = 'http://localhost:1234') {
    this.baseUrl = baseUrl;
  }

  async chat(messages, options = {}) {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || -1,
        stream: options.stream || false
      })
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }
}

/**
 * Universal Local API Bridge
 */
export class LocalAPIBridge {
  constructor(config = {}) {
    this.apis = new Map();

    // Auto-detect common local APIs
    this.detectAPIs();
  }

  async detectAPIs() {
    const commonAPIs = [
      { name: 'ollama', url: 'http://localhost:11434', health: '/api/tags' },
      { name: 'lmstudio', url: 'http://localhost:1234', health: '/v1/models' },
      { name: 'localai', url: 'http://localhost:8080', health: '/readyz' }
    ];

    for (const api of commonAPIs) {
      try {
        const response = await fetch(api.url + api.health);
        if (response.ok) {
          this.apis.set(api.name, { ...api, available: true });
          console.log(`[LocalAPI] Detected: ${api.name} at ${api.url}`);
        }
      } catch {
        // API not available
      }
    }
  }

  getAvailableAPIs() {
    return Array.from(this.apis.values()).filter(api => api.available);
  }

  async callAPI(name, endpoint, options = {}) {
    const api = this.apis.get(name);
    if (!api) {
      throw new Error(`API not found: ${name}`);
    }

    const response = await fetch(api.url + endpoint, options);
    return await response.json();
  }
}

/**
 * Crown + Ollama Integration
 * Injects Crown personality and knowledge into Ollama chat
 */

import { CrownLoader } from './crown-loader.js';
import { OllamaBridge } from '../core/ollama-bridge.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

export class CrownOllamaIntegration {
  constructor(ollamaBaseUrl = 'http://localhost:11434') {
    this.crownLoader = new CrownLoader();
    this.ollama = new OllamaBridge(ollamaBaseUrl);
    this.conversations = new Map(); // Track multi-turn conversations

    console.log(`[Crown-Ollama] Integration initialized with ${ollamaBaseUrl}`);
  }

  /**
   * Initialize and check Ollama availability
   */
  async initialize() {
    const isAvailable = await this.ollama.checkHealth();
    if (isAvailable) {
      console.log(`[Crown-Ollama] Connected - ${this.ollama.models.length} models available`);
    } else {
      console.log(`[Crown-Ollama] Ollama not available - integration will fail until Ollama is running`);
    }
    return isAvailable;
  }

  /**
   * Chat with Ollama using Crown personality
   * @param {string} crownId - Crown ID (e.g., "dungeon-master")
   * @param {string} model - Ollama model name (e.g., "llama2", "mistral")
   * @param {string} userMessage - User's message
   * @param {Object} options - Additional options
   * @returns {Object} Chat response with Crown context
   */
  async chatWithCrown(crownId, model, userMessage, options = {}) {
    try {
      // Load Crown
      const crownPath = path.join(PROJECT_ROOT, 'examples/crowns', `${crownId}.json`);
      const crown = await this.crownLoader.loadCrown(crownPath);
      const context = this.crownLoader.buildContext(crown);

      // Extract Crown configuration
      const crownConfig = crown.config || {};
      const systemPrompt = crownConfig.systemPrompt || '';
      const temperature = crownConfig.temperature || 0.7;
      const personality = crownConfig.personality || 'neutral';

      // Build conversation history
      const conversationId = options.conversationId || `${crownId}-${model}-${Date.now()}`;
      let messages = this.conversations.get(conversationId) || [];

      // Add system prompt if this is the first message
      if (messages.length === 0) {
        messages.push({
          role: 'system',
          content: systemPrompt
        });

        // Optionally inject Crown knowledge context
        if (options.includeKnowledge && context.knowledge) {
          messages.push({
            role: 'system',
            content: `Additional Knowledge:\n${context.knowledge}`
          });
        }
      }

      // Add user message
      messages.push({
        role: 'user',
        content: userMessage
      });

      // Call Ollama with Crown-influenced parameters
      const response = await this.ollama.chat(model, messages, {
        temperature: options.temperature || temperature,
        stream: options.stream || false,
        ...options
      });

      // Add assistant response to conversation history
      if (response.message) {
        messages.push({
          role: 'assistant',
          content: response.message.content
        });
      }

      // Store conversation for multi-turn support
      this.conversations.set(conversationId, messages);

      return {
        success: true,
        conversationId,
        crown: {
          id: crownId,
          name: crown.name,
          personality,
          temperature
        },
        model,
        response: response.message?.content || response.response,
        stats: {
          total_duration: response.total_duration,
          load_duration: response.load_duration,
          prompt_eval_count: response.prompt_eval_count,
          eval_count: response.eval_count,
          tokens_per_second: response.eval_count && response.total_duration
            ? (response.eval_count / (response.total_duration / 1e9)).toFixed(2)
            : null
        },
        messageCount: messages.length
      };
    } catch (error) {
      console.error('[Crown-Ollama] Chat error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Multi-model swarm with Crown personality
   * Queries multiple Ollama models in parallel with same Crown context
   */
  async swarmChatWithCrown(crownId, userMessage, models = null, options = {}) {
    try {
      // Load Crown
      const crownPath = path.join(PROJECT_ROOT, 'examples/crowns', `${crownId}.json`);
      const crown = await this.crownLoader.loadCrown(crownPath);

      const crownConfig = crown.config || {};
      const systemPrompt = crownConfig.systemPrompt || '';

      // Get available models
      const targetModels = models || this.ollama.models.map(m => m.name).slice(0, 3);

      console.log(`[Crown-Ollama] Swarm chat: ${crownId} with ${targetModels.length} models`);

      // Query all models in parallel
      const promises = targetModels.map(async (model) => {
        try {
          const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ];

          const result = await this.ollama.chat(model, messages, {
            temperature: crownConfig.temperature || 0.7,
            stream: false
          });

          return {
            model,
            success: true,
            response: result.message?.content || result.response,
            stats: {
              duration: result.total_duration,
              tokens: result.eval_count,
              tokens_per_second: result.eval_count && result.total_duration
                ? (result.eval_count / (result.total_duration / 1e9)).toFixed(2)
                : null
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
        success: true,
        crown: {
          id: crownId,
          name: crown.name,
          personality: crownConfig.personality
        },
        message: userMessage,
        models: targetModels,
        responses: results,
        consensus: this.buildConsensus(results)
      };
    } catch (error) {
      console.error('[Crown-Ollama] Swarm error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build consensus from multiple model responses
   */
  buildConsensus(results) {
    const successful = results.filter(r => r.success);

    if (successful.length === 0) {
      return { error: 'No successful responses' };
    }

    // Return fastest response as primary
    const fastest = successful.sort((a, b) =>
      (a.stats?.duration || Infinity) - (b.stats?.duration || Infinity)
    )[0];

    return {
      primary: fastest.response,
      model: fastest.model,
      alternatives: successful
        .filter(r => r.model !== fastest.model)
        .map(r => ({ model: r.model, response: r.response }))
    };
  }

  /**
   * Clear conversation history
   */
  clearConversation(conversationId) {
    this.conversations.delete(conversationId);
  }

  /**
   * List available Ollama models
   */
  async listModels() {
    try {
      return await this.ollama.listModels();
    } catch (error) {
      console.error('[Crown-Ollama] Error listing models:', error);
      return [];
    }
  }

  /**
   * Get conversation history
   */
  getConversation(conversationId) {
    return this.conversations.get(conversationId) || [];
  }

  /**
   * Set custom Ollama base URL (for cloud models or custom endpoints)
   */
  setOllamaURL(baseUrl) {
    this.ollama = new OllamaBridge(baseUrl);
    console.log(`[Crown-Ollama] Ollama URL updated to: ${baseUrl}`);
  }
}

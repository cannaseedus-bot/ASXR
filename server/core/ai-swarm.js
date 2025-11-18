/**
 * AI Swarm Server
 * Handles AI chat swarm coordination and multi-agent communication
 * Supports local APIs like Ollama, LM Studio, LocalAI
 */

import { OllamaBridge, LMStudioBridge, LocalAPIBridge } from './ollama-bridge.js';

export class AISwarmServer {
  constructor(hive) {
    this.hive = hive;
    this.agents = new Map();
    this.swarms = new Map();
    this.connections = new Map();

    // Local API bridges
    this.ollama = new OllamaBridge();
    this.lmstudio = new LMStudioBridge();
    this.localAPIs = new LocalAPIBridge();

    console.log('[AI] AI Swarm Server initialized');

    // Auto-detect Ollama
    this.initializeOllama();
  }

  async initializeOllama() {
    const available = await this.ollama.checkHealth();
    if (available) {
      await this.ollama.listModels();
      console.log(`[AI] Ollama connected with ${this.ollama.models.length} models`);
    }
  }

  /**
   * Handle AI HTTP requests
   */
  async handleRequest(req, res, url) {
    const endpoint = url.pathname.replace('/ai/', '');

    try {
      switch (endpoint) {
        case 'chat':
          await this.handleChat(req, res);
          break;

        case 'ollama/models':
          const models = await this.ollama.listModels();
          this.respondJSON(res, 200, { models });
          break;

        case 'ollama/chat':
          await this.handleOllamaChat(req, res);
          break;

        case 'ollama/swarm':
          await this.handleOllamaSwarm(req, res);
          break;

        case 'ollama/generate':
          await this.handleOllamaGenerate(req, res);
          break;

        case 'local-apis':
          const apis = this.localAPIs.getAvailableAPIs();
          this.respondJSON(res, 200, { apis });
          break;

        case 'swarm/create':
          await this.createSwarm(req, res);
          break;

        case 'swarm/list':
          this.respondJSON(res, 200, Array.from(this.swarms.values()));
          break;

        case 'agents':
          this.respondJSON(res, 200, Array.from(this.agents.values()));
          break;

        default:
          this.respondJSON(res, 404, { error: 'AI endpoint not found' });
      }
    } catch (err) {
      console.error('[AI] Error:', err);
      this.respondJSON(res, 500, { error: err.message });
    }
  }

  /**
   * Handle Ollama chat request
   */
  async handleOllamaChat(req, res) {
    const body = await this.readBody(req);
    const { model, messages, options } = JSON.parse(body);

    const result = await this.ollama.chat(model, messages, options);
    this.respondJSON(res, 200, result);
  }

  /**
   * Handle Ollama swarm (multi-model chat)
   */
  async handleOllamaSwarm(req, res) {
    const body = await this.readBody(req);
    const { message, models, options } = JSON.parse(body);

    const result = await this.ollama.swarmChat(message, models, options);
    this.respondJSON(res, 200, result);
  }

  /**
   * Handle Ollama generate
   */
  async handleOllamaGenerate(req, res) {
    const body = await this.readBody(req);
    const { model, prompt, options } = JSON.parse(body);

    const result = await this.ollama.generate(model, prompt, options);
    this.respondJSON(res, 200, result);
  }

  /**
   * Handle chat request
   */
  async handleChat(req, res) {
    const body = await this.readBody(req);
    const { message, agent, context } = JSON.parse(body);

    // Mock AI response for now
    const response = {
      agent: agent || 'default',
      message: `AI Response to: "${message}"`,
      timestamp: Date.now(),
      context
    };

    this.respondJSON(res, 200, response);
  }

  /**
   * Create AI swarm
   */
  async createSwarm(req, res) {
    const body = await this.readBody(req);
    const { name, agents, task } = JSON.parse(body);

    const swarmId = Math.random().toString(36).substr(2, 9);
    const swarm = {
      id: swarmId,
      name,
      agents: agents || ['coordinator', 'worker1', 'worker2'],
      task,
      created: Date.now(),
      status: 'active',
      messages: []
    };

    this.swarms.set(swarmId, swarm);

    this.respondJSON(res, 201, swarm);
  }

  /**
   * Handle WebSocket connections for real-time swarm communication
   */
  handleWebSocket(ws, url) {
    const connectionId = Math.random().toString(36).substr(2, 9);
    this.connections.set(connectionId, ws);

    console.log(`[AI] Swarm WebSocket connected: ${connectionId}`);

    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message.toString());

        switch (msg.type) {
          case 'swarm:join':
            // Join swarm
            ws.send(JSON.stringify({
              type: 'swarm:joined',
              swarmId: msg.swarmId,
              agents: ['coordinator', 'worker1', 'worker2']
            }));
            break;

          case 'swarm:message':
            // Broadcast message to swarm
            const response = await this.processSwarmMessage(msg);
            ws.send(JSON.stringify({
              type: 'swarm:response',
              ...response
            }));
            break;

          case 'agent:spawn':
            // Spawn new agent
            const agent = this.spawnAgent(msg.agentType, msg.config);
            ws.send(JSON.stringify({
              type: 'agent:spawned',
              agent
            }));
            break;
        }
      } catch (err) {
        ws.send(JSON.stringify({
          type: 'error',
          error: err.message
        }));
      }
    });

    ws.on('close', () => {
      this.connections.delete(connectionId);
      console.log(`[AI] Swarm WebSocket disconnected: ${connectionId}`);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'swarm:connected',
      connectionId,
      availableSwarms: Array.from(this.swarms.keys())
    }));
  }

  /**
   * Process swarm message with multi-agent coordination
   */
  async processSwarmMessage(msg) {
    // Mock multi-agent processing
    const agents = ['coordinator', 'analyzer', 'executor'];
    const responses = agents.map(agent => ({
      agent,
      response: `${agent} processed: "${msg.message}"`,
      timestamp: Date.now()
    }));

    return {
      messageId: msg.messageId,
      agents: responses,
      consensus: responses[0].response
    };
  }

  /**
   * Spawn AI agent
   */
  spawnAgent(type, config) {
    const agentId = Math.random().toString(36).substr(2, 9);
    const agent = {
      id: agentId,
      type,
      config,
      status: 'active',
      created: Date.now()
    };

    this.agents.set(agentId, agent);
    console.log(`[AI] Agent spawned: ${type} (${agentId})`);

    return agent;
  }

  // Utilities
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

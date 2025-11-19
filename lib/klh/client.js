/**
 * KLH Client Library
 * Browser-side hive orchestration and virtual mesh networking
 */

class KLHClient {
  constructor(serverUrl = '') {
    this.serverUrl = serverUrl;
    this.hiveId = null;
    this.shards = new Map();
    this.mesh = null;
    this.wsConnection = null;
  }

  /**
   * Boot hive from configuration
   */
  async bootHive(config) {
    console.log('[KLH] Booting hive...');

    const response = await fetch(`${this.serverUrl}/api/hive/boot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    const result = await response.json();
    this.hiveId = result.hive;
    this.mesh = result.mesh;

    console.log(`[KLH] Hive ${this.hiveId} booted`);

    return result;
  }

  /**
   * Register shard
   */
  async registerShard(shardDef) {
    const response = await fetch(`${this.serverUrl}/api/hive/shards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shardDef)
    });

    const shard = await response.json();
    this.shards.set(shard.id, shard);

    console.log(`[KLH] Shard registered: ${shard.id}`);

    return shard;
  }

  /**
   * List all shards
   */
  async listShards() {
    const response = await fetch(`${this.serverUrl}/api/hive/shards`);
    const shards = await response.json();

    shards.forEach(s => this.shards.set(s.id, s));

    return shards;
  }

  /**
   * Virtual mesh fetch - intercepts localhost:port calls
   */
  async hiveFetch(url, options = {}) {
    // Check if this is a virtual mesh call
    const match = url.match(/^http:\/\/localhost:(\d+)(\/.*)/);

    if (match) {
      const [, port, path] = match;

      // Find shard by port
      const shard = Array.from(this.shards.values())
        .find(s => s.port === parseInt(port));

      if (shard) {
        // Route through mesh
        const meshUrl = `${this.serverUrl}/mesh/${shard.id}${path}`;
        return fetch(meshUrl, options);
      }
    }

    // Normal fetch
    return fetch(url, options);
  }

  /**
   * Connect to AI swarm via WebSocket
   */
  connectSwarm(onMessage) {
    const ws = new WebSocket(`ws://${location.host}/ai/swarm`);

    ws.onopen = () => {
      console.log('[KLH] Connected to AI swarm');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      onMessage(msg);
    };

    ws.onerror = (err) => {
      console.error('[KLH] Swarm error:', err);
    };

    this.wsConnection = ws;

    return ws;
  }

  /**
   * Send message to AI swarm
   */
  sendToSwarm(message) {
    if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
      this.wsConnection.send(JSON.stringify(message));
    } else {
      console.error('[KLH] Swarm not connected');
    }
  }

  /**
   * Get hive status
   */
  async getStatus() {
    const response = await fetch(`${this.serverUrl}/api/hive/status`);
    return await response.json();
  }

  /**
   * Get mesh routes
   */
  async getMeshRoutes() {
    const response = await fetch(`${this.serverUrl}/api/mesh/routes`);
    return await response.json();
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.KLHClient = KLHClient;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KLHClient };
}

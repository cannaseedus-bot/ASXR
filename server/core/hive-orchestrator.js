/**
 * KLH - Hive Orchestrator
 * Manages shards, virtual networking, and inter-shard communication
 */

import { randomUUID } from 'crypto';
import { XJSONParser } from '../../lib/xjson/parser.js';
import { KuhulVM } from '../../lib/kuhul/vm.js';
import { SCXCodec } from '../../lib/scx/codec.js';

export class HiveOrchestrator {
  constructor() {
    this.id = randomUUID();
    this.shards = new Map();
    this.mesh = {
      protocol: 'virtual-rest',
      ports: new Map()
    };
    this.registry = new Map();
    this.booted = false;

    console.log(`[KLH] Hive Orchestrator initialized: ${this.id}`);
  }

  /**
   * Boot hive from XJSON configuration
   */
  async boot(config) {
    console.log('[KLH] Booting hive...');

    // Parse XJSON config
    const xjson = new XJSONParser();
    const hiveConfig = typeof config === 'string'
      ? xjson.parse(config)
      : config;

    this.id = hiveConfig.hive || hiveConfig['⟁hive'] || this.id;

    // Register shards from config
    const shards = hiveConfig.shards || hiveConfig['⟁shards'] || [];

    for (const shardDef of shards) {
      await this.createShard(shardDef);
    }

    // Setup mesh networking
    if (hiveConfig.mesh || hiveConfig['⟁mesh']) {
      const meshConfig = hiveConfig.mesh || hiveConfig['⟁mesh'];
      this.mesh.protocol = meshConfig.protocol || meshConfig['⟁protocol'] || 'virtual-rest';

      const ports = meshConfig.ports || meshConfig['⟁ports'] || [];
      ports.forEach((port, idx) => {
        if (shards[idx]) {
          const shardId = shards[idx].id || shards[idx]['⟁id'];
          this.mesh.ports.set(shardId, port);
        }
      });
    }

    this.booted = true;
    console.log(`[KLH] Hive ${this.id} booted with ${this.shards.size} shards`);

    return {
      hive: this.id,
      shards: Array.from(this.shards.keys()),
      mesh: this.mesh.protocol
    };
  }

  /**
   * Create a new shard from XJSON definition
   */
  async createShard(shardDef) {
    const scx = new SCXCodec();
    const xjson = new XJSONParser();

    // Decompress if SCX-compressed
    let def = shardDef;
    if (typeof shardDef === 'string' && shardDef.includes('⟁')) {
      def = scx.decode(shardDef);
    }

    // Parse XJSON
    const shard = typeof def === 'string' ? xjson.parse(def) : def;

    const shardId = shard.id || shard['⟁id'] || randomUUID();
    const port = shard.port || shard['⟁port'] || 3001;
    const runtime = shard.runtime || shard['⟁runtime'] || 'kuhul';

    // Create shard instance
    const shardInstance = {
      id: shardId,
      port,
      runtime,
      api: shard.api || shard['⟁api'] || [],
      view: shard.view || shard['⟁view'] || null,
      handlers: new Map(),
      state: {},
      vm: runtime === 'kuhul' ? new KuhulVM() : null,
      created: Date.now()
    };

    // Compile API handlers
    for (const route of shardInstance.api) {
      const path = route.path || route['⟁path'];
      const method = route.method || route['⟁method'] || 'GET';
      const handler = route.handler || route['⟁handler'];

      shardInstance.handlers.set(`${method}:${path}`, handler);
    }

    // Register shard
    this.shards.set(shardId, shardInstance);
    this.registry.set(shardId, {
      id: shardId,
      port,
      endpoints: shardInstance.api.map(r => ({
        method: r.method || r['⟁method'],
        path: r.path || r['⟁path']
      }))
    });

    console.log(`[KLH] Shard created: ${shardId} on virtual port ${port}`);

    return shardInstance;
  }

  /**
   * Get shard by ID
   */
  getShard(shardId) {
    return this.shards.get(shardId);
  }

  /**
   * Find shard by virtual port
   */
  getShardByPort(port) {
    for (const [id, shard] of this.shards) {
      if (shard.port === port) {
        return shard;
      }
    }
    return null;
  }

  /**
   * Route virtual API call to shard
   */
  async routeToShard(shardId, method, path, data) {
    const shard = this.shards.get(shardId);
    if (!shard) {
      throw new Error(`Shard not found: ${shardId}`);
    }

    const handlerKey = `${method}:${path}`;
    const handler = shard.handlers.get(handlerKey);

    if (!handler) {
      throw new Error(`No handler for ${handlerKey} in shard ${shardId}`);
    }

    // Execute handler in K'uhul VM if available
    if (shard.vm) {
      return await shard.vm.execute(handler, { shard, data, method, path });
    }

    // Fallback: mock response
    return {
      status: 200,
      data: { message: `Handler ${handler} executed`, shard: shardId }
    };
  }

  /**
   * List all shards
   */
  async listShards() {
    return Array.from(this.shards.values()).map(s => ({
      id: s.id,
      port: s.port,
      runtime: s.runtime,
      endpoints: s.api.length,
      hasView: !!s.view
    }));
  }

  /**
   * Get hive status
   */
  async getStatus() {
    return {
      id: this.id,
      booted: this.booted,
      shards: this.shards.size,
      mesh: {
        protocol: this.mesh.protocol,
        routes: this.mesh.ports.size
      },
      uptime: process.uptime()
    };
  }

  /**
   * Execute K'uhul code across shards
   */
  async executeGlyph(code, context = {}) {
    const vm = new KuhulVM();
    return await vm.execute(code, { hive: this, ...context });
  }
}

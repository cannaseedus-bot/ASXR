/**
 * Virtual Mesh Router
 * Handles inter-shard communication and virtual REST networking
 */

export class VirtualMeshRouter {
  constructor(hive) {
    this.hive = hive;
    this.routes = new Map();
    this.activeConnections = new Set();

    console.log('[Mesh] Virtual mesh router initialized');
  }

  /**
   * Handle HTTP mesh requests
   */
  async handleRequest(req, res, url) {
    const pathParts = url.pathname.split('/').filter(Boolean);
    // /mesh/:shardId/:endpoint

    if (pathParts.length < 3) {
      this.respondJSON(res, 400, { error: 'Invalid mesh route' });
      return;
    }

    const shardId = pathParts[1];
    const endpoint = '/' + pathParts.slice(2).join('/');
    const method = req.method;

    try {
      // Read request body
      let data = null;
      if (method === 'POST' || method === 'PUT') {
        data = await this.readBody(req);
        data = data ? JSON.parse(data) : null;
      }

      // Route to shard
      const result = await this.hive.routeToShard(shardId, method, endpoint, data);

      this.respondJSON(res, result.status || 200, result.data || result);
    } catch (err) {
      console.error('[Mesh] Routing error:', err);
      this.respondJSON(res, 500, { error: err.message });
    }
  }

  /**
   * Handle WebSocket connections for streaming mesh data
   */
  handleWebSocket(ws, url) {
    const connectionId = Math.random().toString(36).substr(2, 9);
    this.activeConnections.add(connectionId);

    console.log(`[Mesh] WebSocket connected: ${connectionId}`);

    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message.toString());

        if (msg.type === 'mesh:call') {
          // Virtual API call via WebSocket
          const { shardId, method, path, data } = msg;
          const result = await this.hive.routeToShard(shardId, method, path, data);

          ws.send(JSON.stringify({
            type: 'mesh:response',
            requestId: msg.requestId,
            result
          }));
        } else if (msg.type === 'mesh:subscribe') {
          // Subscribe to shard events
          ws.send(JSON.stringify({
            type: 'mesh:subscribed',
            shardId: msg.shardId
          }));
        }
      } catch (err) {
        ws.send(JSON.stringify({
          type: 'error',
          error: err.message
        }));
      }
    });

    ws.on('close', () => {
      this.activeConnections.delete(connectionId);
      console.log(`[Mesh] WebSocket disconnected: ${connectionId}`);
    });

    // Send initial status
    ws.send(JSON.stringify({
      type: 'mesh:connected',
      hive: this.hive.id,
      shards: Array.from(this.hive.shards.keys())
    }));
  }

  /**
   * Get all mesh routes
   */
  getRoutes() {
    const routes = [];

    for (const [shardId, shard] of this.hive.shards) {
      for (const route of shard.api) {
        routes.push({
          shard: shardId,
          port: shard.port,
          method: route.method || route['⟁method'],
          path: route.path || route['⟁path'],
          meshUrl: `/mesh/${shardId}${route.path || route['⟁path']}`
        });
      }
    }

    return routes;
  }

  /**
   * Intercept fetch for client-side virtual networking
   */
  generateClientInterceptor() {
    return `
// KLH Mesh Client Interceptor
window.hiveFetch = async (url, options = {}) => {
  // Check if this is a virtual mesh call
  const match = url.match(/^http:\\/\\/localhost:(\\d+)(\\/.*)/);

  if (match) {
    const [, port, path] = match;
    const shards = ${JSON.stringify(Array.from(this.hive.registry.values()))};
    const shard = shards.find(s => s.port === parseInt(port));

    if (shard) {
      // Route through mesh
      const meshUrl = \`/mesh/\${shard.id}\${path}\`;
      return fetch(meshUrl, options);
    }
  }

  // Normal fetch
  return fetch(url, options);
};
`;
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

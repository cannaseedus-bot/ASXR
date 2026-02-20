/**
 * SCX Model Loader
 *
 * Loads SCX-TP-INT4 quantized models for browser inference
 * - Decodes base64 tensor packs from GitHub/local storage
 * - Verifies Merkle tree integrity
 * - Maps weight blocks to GPU buffers
 * - Loads layer configurations
 */

import { SCXTensorPack } from '../scx/tensor-pack.js';
import { MerkleVerification } from '../scx/merkle-verification.js';

export class SCXModelLoader {
  constructor() {
    this.tensorPack = new SCXTensorPack();
    this.merkleVerification = new MerkleVerification();
    this.model = null;
    this.config = null;
    this.weights = {};
  }

  /**
   * Load model from JSON file or object
   *
   * Expected format:
   * {
   *   "name": "gpt-12l-32m-int4",
   *   "format": "scx-tp-int4",
   *   "config": {
   *     "num_layers": 12,
   *     "hidden_size": 512,
   *     "n_heads": 8,
   *     "head_dim": 64,
   *     "vocab_size": 50304,
   *     "max_seq_len": 512
   *   },
   *   "weights": {
   *     "embeddings": "base64_encoded_data",
   *     "layers": [
   *       {
   *         "attn_q": "...",
   *         "attn_k": "...",
   *         "attn_v": "...",
   *         "attn_out": "...",
   *         "mlp_in": "...",
   *         "mlp_out": "...",
   *         "norm1": "...",
   *         "norm2": "..."
   *       },
   *       ...
   *     ],
   *     "output_head": "base64_encoded_data"
   *   },
   *   "merkle_root": "sha256_hash",
   *   "compression_ratio": "7.11x"
   * }
   */
  async loadFromJSON(modelData) {
    if (typeof modelData === 'string') {
      // Load from JSON file path (Node.js)
      try {
        const fs = await import('fs');
        const data = fs.readFileSync(modelData, 'utf-8');
        modelData = JSON.parse(data);
      } catch (error) {
        throw new Error(`Failed to load model from ${modelData}: ${error.message}`);
      }
    }

    // Validate structure
    if (!modelData.config || !modelData.weights) {
      throw new Error('Invalid model format: missing config or weights');
    }

    this.config = modelData.config;
    this.model = modelData;

    console.log(`[Model] Loading ${modelData.name || 'unnamed'} model`);
    console.log(`[Model] Architecture: ${this.config.num_layers}L, ${this.config.hidden_size}H, ${this.config.n_heads}H×${this.config.head_dim}D`);

    // Decode all weight tensors
    await this._decodeWeights(modelData.weights);

    // Verify model integrity if Merkle root provided
    if (modelData.merkle_root) {
      await this._verifyIntegrity(modelData.merkle_root);
    }

    console.log(`[Model] ✓ Model loaded successfully`);
    console.log(`[Model] Memory estimate: ~${this._estimateMemory()}MB (FP32)`);

    return this;
  }

  /**
   * Load from base64 tensor pack (alternative format)
   */
  async loadFromBase64(base64Data, config) {
    // Decode base64 to binary
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Decode tensor pack
    const pack = this.tensorPack.decode(bytes.buffer);

    this.config = config || pack.config;
    this.model = pack;

    console.log(`[Model] Loading model from tensor pack`);
    console.log(`[Model] Merkle root: ${Array.from(pack.merkle_root).map(b => b.toString(16).padStart(2, '0')).join('')}`);

    // Weights are already decoded in tensor pack
    this.weights = pack.weights || {};

    return this;
  }

  /**
   * Decode all weight tensors from base64
   */
  async _decodeWeights(weightsData) {
    console.log('[Decode] Processing weight tensors...');

    // Embeddings
    if (weightsData.embeddings) {
      this.weights.embeddings = this._base64ToFloat32Array(weightsData.embeddings);
      console.log(`[Decode] Embeddings: ${this.weights.embeddings.length} values`);
    }

    // Layer weights
    if (weightsData.layers && Array.isArray(weightsData.layers)) {
      this.weights.layers = [];

      for (let i = 0; i < weightsData.layers.length; i++) {
        const layerData = weightsData.layers[i];
        const layer = {};

        // Attention weights
        if (layerData.attn_q) layer.attn_q = this._base64ToInt4Array(layerData.attn_q);
        if (layerData.attn_k) layer.attn_k = this._base64ToInt4Array(layerData.attn_k);
        if (layerData.attn_v) layer.attn_v = this._base64ToInt4Array(layerData.attn_v);
        if (layerData.attn_out) layer.attn_out = this._base64ToInt4Array(layerData.attn_out);

        // MLP weights
        if (layerData.mlp_in) layer.mlp_in = this._base64ToInt4Array(layerData.mlp_in);
        if (layerData.mlp_out) layer.mlp_out = this._base64ToInt4Array(layerData.mlp_out);

        // Layer norm parameters
        if (layerData.norm1) layer.norm1 = this._base64ToFloat32Array(layerData.norm1);
        if (layerData.norm2) layer.norm2 = this._base64ToFloat32Array(layerData.norm2);

        this.weights.layers.push(layer);
      }

      console.log(`[Decode] Layers: ${this.weights.layers.length}`);
    }

    // Output head (projection to vocabulary)
    if (weightsData.output_head) {
      this.weights.output_head = this._base64ToInt4Array(weightsData.output_head);
      console.log(`[Decode] Output head: ${this.weights.output_head.length} values`);
    }
  }

  /**
   * Verify model integrity using Merkle tree
   */
  async _verifyIntegrity(merkleRoot) {
    console.log('[Verify] Checking model integrity...');

    // Reconstruct all weights into single buffer for Merkle verification
    const allWeights = [];

    if (this.weights.embeddings) allWeights.push(...this.weights.embeddings);
    if (this.weights.layers) {
      for (const layer of this.weights.layers) {
        if (layer.attn_q) allWeights.push(...layer.attn_q);
        if (layer.attn_k) allWeights.push(...layer.attn_k);
        if (layer.attn_v) allWeights.push(...layer.attn_v);
        if (layer.attn_out) allWeights.push(...layer.attn_out);
        if (layer.mlp_in) allWeights.push(...layer.mlp_in);
        if (layer.mlp_out) allWeights.push(...layer.mlp_out);
      }
    }
    if (this.weights.output_head) allWeights.push(...this.weights.output_head);

    // Convert to Uint8Array for hashing
    const buffer = new Uint8Array(allWeights.length);
    for (let i = 0; i < allWeights.length; i++) {
      buffer[i] = allWeights[i];
    }

    // Verify Merkle root
    const result = await this.merkleVerification.verify({
      weights: buffer,
      merkle_root: merkleRoot
    });

    if (!result.valid) {
      throw new Error(`Merkle verification failed: ${result.error}`);
    }

    console.log(`[Verify] ✓ Merkle root verified`);
  }

  /**
   * Convert base64 to Float32Array
   */
  _base64ToFloat32Array(base64Data) {
    // Decode base64 to binary
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Convert bytes to Float32Array
    const float32Array = new Float32Array(bytes.buffer);
    return float32Array;
  }

  /**
   * Convert base64 to INT4Array (stored as Int8Array, 2 values per byte)
   */
  _base64ToInt4Array(base64Data) {
    // Decode base64 to binary
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // INT4 values are packed 2 per byte - return as packed
    return bytes;
  }

  /**
   * Get embedding for token ID
   */
  getEmbedding(tokenId) {
    if (!this.weights.embeddings) {
      throw new Error('No embeddings loaded');
    }

    const hiddenSize = this.config.hidden_size;
    const start = tokenId * hiddenSize;
    const end = start + hiddenSize;

    if (end > this.weights.embeddings.length) {
      throw new Error(`Token ID ${tokenId} out of range`);
    }

    return this.weights.embeddings.slice(start, end);
  }

  /**
   * Get all layer weights
   */
  getLayerWeights(layerIdx) {
    if (!this.weights.layers || layerIdx >= this.weights.layers.length) {
      throw new Error(`Layer ${layerIdx} not found`);
    }

    return this.weights.layers[layerIdx];
  }

  /**
   * Get output head weights
   */
  getOutputHead() {
    return this.weights.output_head;
  }

  /**
   * Get model configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Estimate memory usage in MB (FP32 equivalent)
   */
  _estimateMemory() {
    let totalValues = 0;

    if (this.weights.embeddings) {
      totalValues += this.weights.embeddings.length;
    }

    if (this.weights.layers) {
      for (const layer of this.weights.layers) {
        // INT4 packed: 2 values per byte, so byte count / 0.5 = value count
        if (layer.attn_q) totalValues += layer.attn_q.length * 2;
        if (layer.attn_k) totalValues += layer.attn_k.length * 2;
        if (layer.attn_v) totalValues += layer.attn_v.length * 2;
        if (layer.attn_out) totalValues += layer.attn_out.length * 2;
        if (layer.mlp_in) totalValues += layer.mlp_in.length * 2;
        if (layer.mlp_out) totalValues += layer.mlp_out.length * 2;
        if (layer.norm1) totalValues += layer.norm1.length;
        if (layer.norm2) totalValues += layer.norm2.length;
      }
    }

    if (this.weights.output_head) {
      totalValues += this.weights.output_head.length * 2;
    }

    // Assume 4 bytes per FP32 value
    return Math.round(totalValues * 4 / 1024 / 1024);
  }

  /**
   * Log model information
   */
  printInfo() {
    if (!this.config) {
      console.log('[Model] No model loaded');
      return;
    }

    console.log('='.repeat(60));
    console.log('SCX Model Information');
    console.log('='.repeat(60));
    console.log(`Name:                 ${this.model.name || 'unnamed'}`);
    console.log(`Format:               ${this.model.format || 'unknown'}`);
    console.log(`Layers:               ${this.config.num_layers}`);
    console.log(`Hidden Size:          ${this.config.hidden_size}`);
    console.log(`Attention Heads:      ${this.config.n_heads}`);
    console.log(`Head Dimension:       ${this.config.head_dim}`);
    console.log(`Vocabulary Size:      ${this.config.vocab_size}`);
    console.log(`Max Sequence Length:  ${this.config.max_seq_len}`);
    console.log(`Total Parameters:     ~${this._countParameters()}M`);
    console.log(`Memory (FP32):        ~${this._estimateMemory()}MB`);
    if (this.model.compression_ratio) {
      console.log(`Compression Ratio:    ${this.model.compression_ratio}`);
    }
    console.log('='.repeat(60));
  }

  /**
   * Count total model parameters
   */
  _countParameters() {
    const h = this.config.hidden_size;
    const v = this.config.vocab_size;
    const l = this.config.num_layers;
    const n = this.config.n_heads;
    const d = this.config.head_dim;

    // Rough estimate:
    // - Embeddings: v × h
    // - Per layer: 3×(h×h) for Q,K,V + (h×h) for out + (h×4h) for MLP in + (4h×h) for MLP out
    // - Output: h × v

    const embeddings = v * h;
    const perLayer = 3 * h * h + h * h + h * 4 * h + 4 * h * h;
    const output = h * v;

    const total = (embeddings + perLayer * l + output) / 1_000_000;
    return total.toFixed(1);
  }
}

/**
 * Load model with automatic format detection
 */
export async function loadModel(input, config = null) {
  const loader = new SCXModelLoader();

  if (typeof input === 'string' && input.startsWith('data:')) {
    // Data URI with base64
    const base64 = input.split(',')[1];
    return loader.loadFromBase64(base64, config);
  } else if (typeof input === 'string') {
    // File path or URL
    return loader.loadFromJSON(input);
  } else if (typeof input === 'object') {
    // Already parsed JSON
    return loader.loadFromJSON(input);
  } else {
    throw new Error('Invalid input: expected file path, URL, base64, or JSON object');
  }
}

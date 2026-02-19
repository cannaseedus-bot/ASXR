/**
 * SCX Tensor Pack (SCX-TP-INT4) - Binary Encoder/Decoder
 *
 * Hardware-realistic browser-native model format with:
 * - INT4 quantized weights
 * - Deterministic binary layout
 * - Base64 encoding for GitHub storage
 * - Block-wise quantization (128-element blocks)
 * - Merkle verification
 */

export class SCXTensorPack {
  constructor() {
    this.MAGIC = 0x53435834; // 'SCX4'
    this.VERSION_MAJOR = 1;
    this.VERSION_MINOR = 0;
    this.HEADER_SIZE = 64;
  }

  /**
   * Create a new tensor pack with specified configuration
   */
  create(config) {
    const pack = {
      magic: this.MAGIC,
      version: { major: this.VERSION_MAJOR, minor: this.VERSION_MINOR },
      config: {
        n_layers: config.n_layers || 12,
        hidden_size: config.hidden_size || 768,
        n_heads: config.n_heads || 12,
        seq_len: config.seq_len || 2048,
        vocab_size: config.vocab_size || 50257
      },
      merkle_root: new Uint8Array(32), // Will be computed after weights added
      weights: null, // Will be set by quantizer
      metadata: config.metadata || {}
    };

    return pack;
  }

  /**
   * Encode tensor pack to binary ArrayBuffer
   * Layout:
   *   0x00: Magic (4 bytes)
   *   0x04: Version major (1 byte)
   *   0x05: Version minor (1 byte)
   *   0x06: Flags (2 bytes) - reserved
   *   0x08: n_layers (4 bytes)
   *   0x0C: hidden_size (4 bytes)
   *   0x10: n_heads (4 bytes)
   *   0x14: seq_len (4 bytes)
   *   0x18: vocab_size (4 bytes)
   *   0x1C: weight_offset (4 bytes)
   *   0x20: Merkle root (32 bytes)
   *   0x40: Weights (variable length, INT4 packed)
   */
  encode(pack) {
    if (!pack || pack.magic !== this.MAGIC) {
      throw new Error('Invalid SCX tensor pack');
    }

    // Calculate total size
    const weightsSize = pack.weights ? pack.weights.byteLength : 0;
    const totalSize = this.HEADER_SIZE + weightsSize;

    // Create buffer
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    // Write header
    view.setUint32(offset, pack.magic, true); // little-endian
    offset += 4;

    view.setUint8(offset, pack.version.major);
    offset += 1;

    view.setUint8(offset, pack.version.minor);
    offset += 1;

    view.setUint16(offset, 0, true); // flags (reserved)
    offset += 2;

    // Write config
    view.setUint32(offset, pack.config.n_layers, true);
    offset += 4;

    view.setUint32(offset, pack.config.hidden_size, true);
    offset += 4;

    view.setUint32(offset, pack.config.n_heads, true);
    offset += 4;

    view.setUint32(offset, pack.config.seq_len, true);
    offset += 4;

    view.setUint32(offset, pack.config.vocab_size, true);
    offset += 4;

    view.setUint32(offset, this.HEADER_SIZE, true); // weight_offset
    offset += 4;

    // Write Merkle root
    const rootArray = new Uint8Array(buffer, offset, 32);
    rootArray.set(pack.merkle_root);
    offset += 32;

    // Write weights
    if (pack.weights) {
      const weightsArray = new Uint8Array(buffer, offset);
      weightsArray.set(new Uint8Array(pack.weights));
    }

    return buffer;
  }

  /**
   * Decode binary ArrayBuffer to tensor pack
   */
  decode(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    // Read and validate magic
    const magic = view.getUint32(offset, true);
    offset += 4;

    if (magic !== this.MAGIC) {
      throw new Error(`Invalid magic: expected 0x${this.MAGIC.toString(16)}, got 0x${magic.toString(16)}`);
    }

    // Read version
    const major = view.getUint8(offset);
    offset += 1;

    const minor = view.getUint8(offset);
    offset += 1;

    const flags = view.getUint16(offset, true);
    offset += 2;

    // Read config
    const config = {
      n_layers: view.getUint32(offset, true),
      hidden_size: view.getUint32(offset + 4, true),
      n_heads: view.getUint32(offset + 8, true),
      seq_len: view.getUint32(offset + 12, true),
      vocab_size: view.getUint32(offset + 16, true)
    };
    offset += 20;

    const weight_offset = view.getUint32(offset, true);
    offset += 4;

    // Read Merkle root
    const merkle_root = new Uint8Array(buffer, offset, 32);
    offset += 32;

    // Read weights
    const weights = buffer.slice(weight_offset);

    return {
      magic,
      version: { major, minor },
      flags,
      config,
      merkle_root: new Uint8Array(merkle_root), // copy
      weights,
      metadata: {}
    };
  }

  /**
   * Encode binary to base64 (for GitHub storage)
   */
  encodeBase64(buffer) {
    if (typeof Buffer !== 'undefined') {
      // Node.js
      return Buffer.from(buffer).toString('base64');
    } else {
      // Browser
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
  }

  /**
   * Decode base64 to binary (when loaded from GitHub)
   */
  decodeBase64(base64String) {
    if (typeof Buffer !== 'undefined') {
      // Node.js
      return Buffer.from(base64String, 'base64').buffer;
    } else {
      // Browser
      const binary = atob(base64String);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
  }

  /**
   * Pack two INT4 values into one byte
   * Values must be in range [-8, 7]
   */
  packINT4Pair(value0, value1) {
    // Clamp to INT4 range
    value0 = Math.max(-8, Math.min(7, Math.round(value0)));
    value1 = Math.max(-8, Math.min(7, Math.round(value1)));

    // Convert to unsigned 4-bit
    const unsigned0 = value0 < 0 ? value0 + 16 : value0;
    const unsigned1 = value1 < 0 ? value1 + 16 : value1;

    // Pack: high nibble = value0, low nibble = value1
    return ((unsigned0 & 0x0F) << 4) | (unsigned1 & 0x0F);
  }

  /**
   * Unpack one byte to two INT4 values
   */
  unpackINT4Pair(byte) {
    // Extract nibbles
    const unsigned0 = (byte >> 4) & 0x0F;
    const unsigned1 = byte & 0x0F;

    // Convert to signed
    const value0 = unsigned0 >= 8 ? unsigned0 - 16 : unsigned0;
    const value1 = unsigned1 >= 8 ? unsigned1 - 16 : unsigned1;

    return [value0, value1];
  }

  /**
   * Pack array of INT4 values to Uint8Array
   * Length must be even (pads with 0 if odd)
   */
  packINT4Array(values) {
    const length = values.length;
    const paddedLength = length % 2 === 0 ? length : length + 1;
    const packed = new Uint8Array(paddedLength / 2);

    for (let i = 0; i < length; i += 2) {
      const v0 = values[i];
      const v1 = i + 1 < length ? values[i + 1] : 0;
      packed[i / 2] = this.packINT4Pair(v0, v1);
    }

    return packed;
  }

  /**
   * Unpack Uint8Array to INT4 values
   */
  unpackINT4Array(packed, length = null) {
    const actualLength = length !== null ? length : packed.length * 2;
    const values = new Int8Array(actualLength);

    for (let i = 0; i < packed.length; i++) {
      const [v0, v1] = this.unpackINT4Pair(packed[i]);
      values[i * 2] = v0;
      if (i * 2 + 1 < actualLength) {
        values[i * 2 + 1] = v1;
      }
    }

    return values;
  }

  /**
   * Get statistics about a tensor pack
   */
  getStats(pack) {
    const headerSize = this.HEADER_SIZE;
    const weightsSize = pack.weights ? pack.weights.byteLength : 0;
    const totalSize = headerSize + weightsSize;

    // Estimate FP32 equivalent size
    const numWeights = weightsSize * 2; // 2 INT4 values per byte
    const fp32Size = numWeights * 4; // 4 bytes per FP32
    const compressionRatio = fp32Size > 0 ? (fp32Size / totalSize).toFixed(2) : 0;

    return {
      headerSize,
      weightsSize,
      totalSize,
      numWeights,
      fp32EquivalentSize: fp32Size,
      compressionRatio: compressionRatio + 'x',
      config: pack.config
    };
  }

  /**
   * Validate tensor pack integrity
   */
  validate(pack) {
    const errors = [];

    if (!pack || typeof pack !== 'object') {
      errors.push('Pack is not an object');
      return { valid: false, errors };
    }

    if (pack.magic !== this.MAGIC) {
      errors.push(`Invalid magic: ${pack.magic}`);
    }

    if (!pack.version || pack.version.major !== this.VERSION_MAJOR) {
      errors.push(`Unsupported version: ${pack.version?.major}.${pack.version?.minor}`);
    }

    if (!pack.config) {
      errors.push('Missing config');
    } else {
      if (pack.config.n_layers <= 0) errors.push('Invalid n_layers');
      if (pack.config.hidden_size <= 0) errors.push('Invalid hidden_size');
      if (pack.config.n_heads <= 0) errors.push('Invalid n_heads');
      if (pack.config.seq_len <= 0) errors.push('Invalid seq_len');
      if (pack.config.vocab_size <= 0) errors.push('Invalid vocab_size');
    }

    if (!pack.merkle_root || pack.merkle_root.length !== 32) {
      errors.push('Invalid merkle_root');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

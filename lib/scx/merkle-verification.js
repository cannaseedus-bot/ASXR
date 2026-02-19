/**
 * SCX Merkle Verification
 *
 * Computes Merkle roots for model integrity verification using:
 * - SHA-256 hashing (via Web Crypto API or Node.js crypto)
 * - Binary tree structure
 * - Deterministic leaf ordering
 *
 * Supports both browser (Web Crypto) and Node.js (crypto module)
 */

export class MerkleVerification {
  constructor() {
    this.hashFunction = null;
    this.isNode = typeof process !== 'undefined' && process.versions?.node;
    this.initHashFunction();
  }

  /**
   * Initialize hash function (SHA-256)
   */
  async initHashFunction() {
    if (this.isNode) {
      // Node.js
      const crypto = await import('crypto');
      this.hashFunction = async (data) => {
        const hash = crypto.createHash('sha256');
        hash.update(new Uint8Array(data));
        return hash.digest();
      };
    } else {
      // Browser (Web Crypto API)
      this.hashFunction = async (data) => {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return new Uint8Array(hashBuffer);
      };
    }
  }

  /**
   * Hash a single buffer using SHA-256
   */
  async hash(buffer) {
    if (!this.hashFunction) {
      await this.initHashFunction();
    }
    return await this.hashFunction(buffer);
  }

  /**
   * Concatenate two hash buffers
   */
  concat(hash1, hash2) {
    const result = new Uint8Array(hash1.length + hash2.length);
    result.set(hash1, 0);
    result.set(hash2, hash1.length);
    return result;
  }

  /**
   * Build Merkle tree from leaf hashes
   * Returns root hash
   */
  async buildTree(leafHashes) {
    if (!leafHashes || leafHashes.length === 0) {
      throw new Error('No leaf hashes provided');
    }

    // Single leaf = root
    if (leafHashes.length === 1) {
      return leafHashes[0];
    }

    // Build tree bottom-up
    let currentLevel = leafHashes;

    while (currentLevel.length > 1) {
      const nextLevel = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          // Hash pair
          const combined = this.concat(currentLevel[i], currentLevel[i + 1]);
          const parentHash = await this.hash(combined);
          nextLevel.push(parentHash);
        } else {
          // Odd node - duplicate and hash with itself
          const combined = this.concat(currentLevel[i], currentLevel[i]);
          const parentHash = await this.hash(combined);
          nextLevel.push(parentHash);
        }
      }

      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }

  /**
   * Compute Merkle root for tensor pack weights
   * Divides weights into chunks and hashes each chunk
   */
  async computeWeightsMerkleRoot(weightsBuffer, chunkSize = 4096) {
    if (!weightsBuffer || weightsBuffer.byteLength === 0) {
      // Empty weights - hash empty buffer
      return await this.hash(new Uint8Array(0));
    }

    const bytes = new Uint8Array(weightsBuffer);
    const leafHashes = [];

    // Hash each chunk
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, bytes.length);
      const chunk = bytes.slice(offset, end);
      const chunkHash = await this.hash(chunk);
      leafHashes.push(chunkHash);
    }

    // Build Merkle tree
    return await this.buildTree(leafHashes);
  }

  /**
   * Compute Merkle root for complete tensor pack
   * Includes: config + weights
   */
  async computePackMerkleRoot(pack, chunkSize = 4096) {
    const leafHashes = [];

    // Hash config
    const configString = JSON.stringify(pack.config, Object.keys(pack.config).sort());
    const configBytes = new TextEncoder().encode(configString);
    const configHash = await this.hash(configBytes);
    leafHashes.push(configHash);

    // Hash weights in chunks
    if (pack.weights && pack.weights.byteLength > 0) {
      const bytes = new Uint8Array(pack.weights);

      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, bytes.length);
        const chunk = bytes.slice(offset, end);
        const chunkHash = await this.hash(chunk);
        leafHashes.push(chunkHash);
      }
    }

    // Build Merkle tree
    return await this.buildTree(leafHashes);
  }

  /**
   * Verify tensor pack integrity
   * Recomputes Merkle root and compares with stored root
   */
  async verify(pack, chunkSize = 4096) {
    if (!pack || !pack.merkle_root) {
      return { valid: false, error: 'No merkle root in pack' };
    }

    // Compute current root
    const computedRoot = await this.computePackMerkleRoot(pack, chunkSize);

    // Compare with stored root
    const storedRoot = pack.merkle_root;

    if (computedRoot.length !== storedRoot.length) {
      return {
        valid: false,
        error: 'Root length mismatch',
        expected: Array.from(storedRoot),
        computed: Array.from(computedRoot)
      };
    }

    for (let i = 0; i < computedRoot.length; i++) {
      if (computedRoot[i] !== storedRoot[i]) {
        return {
          valid: false,
          error: 'Root hash mismatch',
          expected: Array.from(storedRoot),
          computed: Array.from(computedRoot)
        };
      }
    }

    return {
      valid: true,
      root: Array.from(computedRoot)
    };
  }

  /**
   * Generate Merkle proof for specific chunk
   * Returns path from leaf to root
   */
  async generateProof(leafHashes, targetIndex) {
    if (targetIndex < 0 || targetIndex >= leafHashes.length) {
      throw new Error('Invalid target index');
    }

    const proof = [];
    let currentLevel = leafHashes;
    let currentIndex = targetIndex;

    while (currentLevel.length > 1) {
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (siblingIndex < currentLevel.length) {
        proof.push({
          hash: currentLevel[siblingIndex],
          position: isRightNode ? 'left' : 'right'
        });
      }

      // Move to next level
      const nextLevel = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          const combined = this.concat(currentLevel[i], currentLevel[i + 1]);
          const parentHash = await this.hash(combined);
          nextLevel.push(parentHash);
        } else {
          const combined = this.concat(currentLevel[i], currentLevel[i]);
          const parentHash = await this.hash(combined);
          nextLevel.push(parentHash);
        }
      }

      currentLevel = nextLevel;
      currentIndex = Math.floor(currentIndex / 2);
    }

    return proof;
  }

  /**
   * Verify Merkle proof
   * Reconstructs root from leaf + proof and compares with expected root
   */
  async verifyProof(leafHash, proof, expectedRoot) {
    let currentHash = leafHash;

    for (const step of proof) {
      const combined = step.position === 'left'
        ? this.concat(step.hash, currentHash)
        : this.concat(currentHash, step.hash);

      currentHash = await this.hash(combined);
    }

    // Compare with expected root
    if (currentHash.length !== expectedRoot.length) {
      return false;
    }

    for (let i = 0; i < currentHash.length; i++) {
      if (currentHash[i] !== expectedRoot[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Convert hash to hex string
   */
  hashToHex(hash) {
    return Array.from(hash)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert hex string to hash
   */
  hexToHash(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }
}

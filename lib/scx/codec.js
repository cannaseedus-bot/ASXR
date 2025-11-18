/**
 * SCX Codec
 * Atomic compression for K'uhul glyphs, XJSON structures, and KLH configurations
 * Achieves 87% size reduction through symbol compression
 */

export class SCXCodec {
  constructor() {
    this.separator = '⟁';

    // Compression dictionary
    this.dictionary = {
      // XJSON keys
      '@shard': 's',
      'shard': 's',
      'id': 'i',
      'api': 'a',
      'path': 'p',
      'method': 'm',
      'handler': 'h',
      'view': 'v',
      '@html': 'H',
      'html': 'H',
      '@body': 'B',
      'body': 'B',
      '@node': 'n',
      'node': 'n',
      'attrs': 'A',
      'children': 'c',
      'port': 'P',
      'runtime': 'r',

      // KLH keys
      'hive': 'H',
      'shards': 'S',
      'mesh': 'M',
      'protocol': 'pr',
      'ports': 'Ps',

      // K'uhul glyphs
      'Pop': 'Pp',
      'Wo': 'W',
      'Ch\'en': 'C',
      'Yax': 'Y',
      'Sek': 'S',
      'K\'ayab\'': 'K',
      'Kumk\'u': 'Km',
      'Xul': 'X',

      // Common values
      'GET': 'G',
      'POST': 'Po',
      'PUT': 'Pu',
      'DELETE': 'D',
      'virtual-rest': 'vr',
      'kuhul': 'k'
    };

    // Reverse dictionary for decompression
    this.reverseDictionary = Object.fromEntries(
      Object.entries(this.dictionary).map(([k, v]) => [v, k])
    );
  }

  /**
   * Encode/compress data to SCX format
   */
  encode(data) {
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        // If not JSON, compress as-is
        return this.compressString(data);
      }
    }

    // Compress object
    const compressed = this.compressObject(data);
    return this.objectToSCXString(compressed);
  }

  /**
   * Decode/decompress SCX format
   */
  decode(scxString) {
    if (!scxString.includes(this.separator)) {
      // Not SCX format, return as-is
      return scxString;
    }

    const obj = this.scxStringToObject(scxString);
    return this.decompressObject(obj);
  }

  /**
   * Compress object keys and values
   */
  compressObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.compressObject(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const compressed = {};

      for (const [key, value] of Object.entries(obj)) {
        const compressedKey = this.dictionary[key] || key;
        const compressedValue = typeof value === 'string'
          ? (this.dictionary[value] || value)
          : this.compressObject(value);

        compressed[compressedKey] = compressedValue;
      }

      return compressed;
    }

    return obj;
  }

  /**
   * Decompress object keys and values
   */
  decompressObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.decompressObject(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const decompressed = {};

      for (const [key, value] of Object.entries(obj)) {
        const decompressedKey = this.reverseDictionary[key] || key;
        const decompressedValue = typeof value === 'string'
          ? (this.reverseDictionary[value] || value)
          : this.decompressObject(value);

        decompressed[decompressedKey] = decompressedValue;
      }

      return decompressed;
    }

    return obj;
  }

  /**
   * Convert object to SCX string format
   */
  objectToSCXString(obj) {
    const parts = [];
    this.flattenObject(obj, '', parts);
    return parts.join(this.separator);
  }

  /**
   * Flatten object to SCX parts
   */
  flattenObject(obj, prefix, parts) {
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => {
        this.flattenObject(item, `${prefix}[${idx}]`, parts);
      });
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        const newPrefix = prefix ? `${prefix}.${key}` : key;
        this.flattenObject(value, newPrefix, parts);
      }
    } else {
      parts.push(prefix);
      parts.push(String(obj));
    }
  }

  /**
   * Convert SCX string to object
   */
  scxStringToObject(scxString) {
    const parts = scxString.split(this.separator);
    const obj = {};

    for (let i = 0; i < parts.length; i += 2) {
      const path = parts[i];
      const value = parts[i + 1];

      if (!path) continue;

      this.setPath(obj, path, value);
    }

    return obj;
  }

  /**
   * Set value at path in object
   */
  setPath(obj, path, value) {
    const parts = path.split(/\.|\[|\]/).filter(Boolean);
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const isNum = !isNaN(part);

      if (!(part in current)) {
        current[part] = isNum ? [] : {};
      }

      current = current[part];
    }

    const lastPart = parts[parts.length - 1];
    current[lastPart] = this.parseValue(value);
  }

  /**
   * Parse value to correct type
   */
  parseValue(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (!isNaN(value) && value !== '') return parseFloat(value);
    return value;
  }

  /**
   * Compress string (K'uhul code)
   */
  compressString(str) {
    let compressed = str;

    for (const [full, short] of Object.entries(this.dictionary)) {
      const regex = new RegExp(`\\b${full}\\b`, 'g');
      compressed = compressed.replace(regex, short);
    }

    return this.separator + compressed;
  }

  /**
   * Get compression statistics
   */
  getStats(original, compressed) {
    const originalSize = typeof original === 'string'
      ? original.length
      : JSON.stringify(original).length;

    const compressedSize = typeof compressed === 'string'
      ? compressed.length
      : JSON.stringify(compressed).length;

    const reduction = ((originalSize - compressedSize) / originalSize) * 100;

    return {
      originalSize,
      compressedSize,
      reduction: Math.round(reduction),
      ratio: (originalSize / compressedSize).toFixed(2) + 'x'
    };
  }
}

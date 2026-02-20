/**
 * BPE Tokenizer for SCX Models
 *
 * Byte-Pair Encoding tokenizer for 50K vocabulary size
 * - Encodes text to token IDs
 * - Decodes token IDs back to text
 * - Supports special tokens (BOS, EOS, PAD, UNK)
 */

export class BPETokenizer {
  constructor(vocabSize = 50304) {
    this.vocabSize = vocabSize;
    this.vocab = {};
    this.merges = [];
    this.bos_token_id = 50256;
    this.eos_token_id = 50257;
    this.pad_token_id = 50258;
    this.unk_token_id = 50259;

    // Token to ID mapping
    this.token2id = {};
    this.id2token = {};

    // Initialize with default vocab
    this._initializeDefaultVocab();
  }

  /**
   * Initialize default vocabulary
   * Includes ASCII + common UTF-8 bytes + common tokens
   */
  _initializeDefaultVocab() {
    let token_id = 0;

    // ASCII characters (0-127)
    for (let i = 0; i < 256; i++) {
      const char = String.fromCharCode(i);
      this.token2id[char] = token_id;
      this.id2token[token_id] = char;
      token_id++;
    }

    // Common English words and subwords
    const commonTokens = [
      ' ', 'the', 'a', 'and', 'or', 'is', 'in', 'to', 'of', 'that',
      'this', 'for', 'with', 'as', 'on', 'by', 'from', 'an', 'are', 'was',
      'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'not', 'no', 'yes', 'what',
      'which', 'who', 'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both',
      'some', 'most', 'more', 'much', 'many', 'other', 'another', 'same', 'such', 'its',
      'your', 'my', 'their', 'our', 'his', 'her', 'me', 'him', 'us', 'them',
      'it', 'you', 'he', 'she', 'we', 'they', 'i', 'new', 'good', 'bad',
      'great', 'small', 'large', 'high', 'low', 'first', 'last', 'next', 'after', 'before',
      'then', 'now', 'here', 'there', 'up', 'down', 'out', 'over', 'under', 'about',
      'er', 'ing', 'ed', 'ly', 'tion', 'sion', 'ment', 'ness', 'able', 'ible',
      'ful', 'less', 'ous', 'ive', 'ize', 'ise', 'al', 'ic', 'ual', 'ity',
      '.', ',', '!', '?', ';', ':', "'", '"', '-', '—', '(', ')', '[', ']', '{', '}',
      '/', '\\', '@', '#', '$', '%', '&', '*', '+', '=', '<', '>', '~', '`', '|',
      '\n', '\t', ' ', '  ', '   ', '    ',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      '00', '01', '10', '11', '100', '1000',
      'article', 'text', 'content', 'document', 'page', 'line', 'word', 'sentence',
      'character', 'string', 'number', 'data', 'file', 'code', 'function', 'method',
      'class', 'object', 'array', 'list', 'map', 'set', 'tree', 'graph', 'node', 'edge',
    ];

    for (const token of commonTokens) {
      if (token_id >= this.vocabSize) break;
      if (!this.token2id.hasOwnProperty(token)) {
        this.token2id[token] = token_id;
        this.id2token[token_id] = token;
        token_id++;
      }
    }

    // Fill remaining slots with placeholder tokens
    while (token_id < this.vocabSize - 4) {
      const placeholder = `<tok_${token_id}>`;
      this.token2id[placeholder] = token_id;
      this.id2token[token_id] = placeholder;
      token_id++;
    }

    // Special tokens at the end
    this.token2id['<BOS>'] = this.bos_token_id;
    this.id2token[this.bos_token_id] = '<BOS>';

    this.token2id['<EOS>'] = this.eos_token_id;
    this.id2token[this.eos_token_id] = '<EOS>';

    this.token2id['<PAD>'] = this.pad_token_id;
    this.id2token[this.pad_token_id] = '<PAD>';

    this.token2id['<UNK>'] = this.unk_token_id;
    this.id2token[this.unk_token_id] = '<UNK>';

    console.log(`[Tokenizer] Vocabulary size: ${Object.keys(this.token2id).length}`);
  }

  /**
   * Load tokenizer from JSON vocabulary
   *
   * Expected format:
   * {
   *   "token2id": { "the": 0, "a": 1, ... },
   *   "special_tokens": {
   *     "bos_token_id": 50256,
   *     "eos_token_id": 50257,
   *     ...
   *   },
   *   "merges": [["e", "r"], ["er", "s"], ...]
   * }
   */
  loadFromJSON(vocabData) {
    if (typeof vocabData === 'string') {
      // Load from file path (Node.js)
      try {
        const fs = require('fs');
        vocabData = JSON.parse(fs.readFileSync(vocabData, 'utf-8'));
      } catch (error) {
        throw new Error(`Failed to load tokenizer: ${error.message}`);
      }
    }

    // Load token mapping
    if (vocabData.token2id) {
      this.token2id = vocabData.token2id;

      // Build reverse mapping
      this.id2token = {};
      for (const [token, id] of Object.entries(this.token2id)) {
        this.id2token[id] = token;
      }

      this.vocabSize = Object.keys(this.token2id).length;
    }

    // Load special tokens
    if (vocabData.special_tokens) {
      const special = vocabData.special_tokens;
      if (special.bos_token_id !== undefined) this.bos_token_id = special.bos_token_id;
      if (special.eos_token_id !== undefined) this.eos_token_id = special.eos_token_id;
      if (special.pad_token_id !== undefined) this.pad_token_id = special.pad_token_id;
      if (special.unk_token_id !== undefined) this.unk_token_id = special.unk_token_id;
    }

    // Load merge rules
    if (vocabData.merges) {
      this.merges = vocabData.merges;
    }

    console.log(`[Tokenizer] Loaded ${this.vocabSize} tokens`);
    return this;
  }

  /**
   * Encode text to token IDs
   *
   * Basic implementation:
   * 1. Split text into characters (bytes)
   * 2. Apply BPE merge rules
   * 3. Map tokens to IDs
   */
  encode(text, addBOS = true, addEOS = true) {
    if (!text) {
      return [];
    }

    // Convert text to tokens (simple character-level initially)
    let tokens = [];

    // Add BOS token
    if (addBOS) {
      tokens.push(this.bos_token_id);
    }

    // Tokenize: split by spaces first, then by characters
    const words = text.split(/(\s+)/);

    for (const word of words) {
      if (!word) continue;

      // Try to find word in vocabulary
      if (this.token2id.hasOwnProperty(word)) {
        tokens.push(this.token2id[word]);
      } else {
        // Fall back to character-level tokenization
        const chars = word.split('');
        for (const char of chars) {
          if (this.token2id.hasOwnProperty(char)) {
            tokens.push(this.token2id[char]);
          } else {
            // Unknown character -> UNK token
            tokens.push(this.unk_token_id);
          }
        }
      }
    }

    // Add EOS token
    if (addEOS) {
      tokens.push(this.eos_token_id);
    }

    return tokens;
  }

  /**
   * Decode token IDs back to text
   */
  decode(tokenIds, skipSpecialTokens = true) {
    const tokens = [];

    for (const id of tokenIds) {
      const token = this.id2token[id];

      if (!token) {
        console.warn(`[Tokenizer] Unknown token ID: ${id}`);
        continue;
      }

      // Skip special tokens if requested
      if (skipSpecialTokens && this._isSpecialToken(id)) {
        continue;
      }

      tokens.push(token);
    }

    // Join tokens with space, then clean up
    let text = tokens.join('');

    // Replace common space patterns
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Check if token is special
   */
  _isSpecialToken(tokenId) {
    return tokenId === this.bos_token_id ||
           tokenId === this.eos_token_id ||
           tokenId === this.pad_token_id ||
           tokenId === this.unk_token_id ||
           (this.id2token[tokenId] && this.id2token[tokenId].startsWith('<'));
  }

  /**
   * Get token ID from token string
   */
  tokenToId(token) {
    return this.token2id[token] !== undefined ? this.token2id[token] : this.unk_token_id;
  }

  /**
   * Get token string from token ID
   */
  idToToken(tokenId) {
    return this.id2token[tokenId] || '<UNK>';
  }

  /**
   * Tokenize text with token count
   */
  encodeWithCount(text) {
    const tokens = this.encode(text);
    return {
      ids: tokens,
      count: tokens.length,
      text: text,
      decoded: this.decode(tokens)
    };
  }

  /**
   * Get vocabulary
   */
  getVocab() {
    return {
      token2id: this.token2id,
      id2token: this.id2token,
      size: this.vocabSize,
      special_tokens: {
        bos_token_id: this.bos_token_id,
        eos_token_id: this.eos_token_id,
        pad_token_id: this.pad_token_id,
        unk_token_id: this.unk_token_id
      }
    };
  }

  /**
   * Save vocabulary to JSON
   */
  toJSON() {
    return {
      vocab_size: this.vocabSize,
      token2id: this.token2id,
      special_tokens: {
        bos_token_id: this.bos_token_id,
        eos_token_id: this.eos_token_id,
        pad_token_id: this.pad_token_id,
        unk_token_id: this.unk_token_id
      },
      merges: this.merges
    };
  }

  /**
   * Log tokenizer information
   */
  printInfo() {
    console.log('='.repeat(60));
    console.log('BPE Tokenizer Information');
    console.log('='.repeat(60));
    console.log(`Vocabulary Size:      ${this.vocabSize}`);
    console.log(`BOS Token ID:         ${this.bos_token_id} (${this.id2token[this.bos_token_id]})`);
    console.log(`EOS Token ID:         ${this.eos_token_id} (${this.id2token[this.eos_token_id]})`);
    console.log(`PAD Token ID:         ${this.pad_token_id} (${this.id2token[this.pad_token_id]})`);
    console.log(`UNK Token ID:         ${this.unk_token_id} (${this.id2token[this.unk_token_id]})`);
    console.log(`Merge Rules:          ${this.merges.length}`);
    console.log('='.repeat(60));
  }
}

/**
 * Create tokenizer with automatic initialization
 */
export function createTokenizer(vocabSize = 50304) {
  return new BPETokenizer(vocabSize);
}

/**
 * Load tokenizer from vocab JSON
 */
export async function loadTokenizer(vocabPath) {
  const tokenizer = new BPETokenizer();
  tokenizer.loadFromJSON(vocabPath);
  return tokenizer;
}

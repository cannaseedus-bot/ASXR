/**
 * SCX Text Generator
 *
 * Token-by-token text generation with temperature sampling
 * - Loads model + tokenizer
 * - Generates text iteratively
 * - Supports Crown context injection
 * - Callback streaming for UI updates
 */

import { SCXModelLoader } from './model-loader.js';
import { BPETokenizer } from './tokenizer.js';
import { InferenceRuntime } from './inference-runtime.js';

export class TextGenerator {
  constructor(model, tokenizer, runtime) {
    this.model = model;
    this.tokenizer = tokenizer;
    this.runtime = runtime;

    this.config = model.getConfig();
    this.stopTokens = new Set([
      this.tokenizer.eos_token_id,
      this.tokenizer.pad_token_id
    ]);

    this.generationStats = {
      tokens_generated: 0,
      total_generation_time: 0,
      tokens_per_second: 0,
      start_time: null
    };
  }

  /**
   * Generate text from prompt
   *
   * Options:
   * - maxTokens: Maximum tokens to generate (default: 100)
   * - temperature: Sampling temperature (default: 0.7)
   * - topK: Top-K filtering (default: null)
   * - stopOnEOS: Stop at EOS token (default: true)
   * - onToken: Callback for each generated token
   * - crownContext: Crown system context string
   */
  async generate(prompt, options = {}) {
    const {
      maxTokens = 100,
      temperature = 0.7,
      topK = null,
      stopOnEOS = true,
      onToken = null,
      crownContext = null
    } = options;

    console.log('='.repeat(60));
    console.log('Text Generation');
    console.log('='.repeat(60));
    console.log(`Prompt: ${prompt}`);
    console.log(`Max tokens: ${maxTokens}, Temperature: ${temperature}`);
    if (crownContext) {
      console.log(`Crown context: ${crownContext.length} characters`);
    }
    console.log('-'.repeat(60));

    this.generationStats.tokens_generated = 0;
    this.generationStats.start_time = performance.now();

    // Build full prompt with Crown context
    let fullPrompt = prompt;
    if (crownContext) {
      fullPrompt = `${crownContext}\n\n${prompt}`;
    }

    // Tokenize prompt
    const tokenIds = this.tokenizer.encode(fullPrompt, true, false);
    console.log(`[Generate] Prompt tokens: ${tokenIds.length}`);

    // Initialize output
    let outputTokens = [...tokenIds];
    let generatedText = '';

    // Generation loop
    for (let step = 0; step < maxTokens; step++) {
      // Get last token
      const lastTokenId = outputTokens[outputTokens.length - 1];

      // Forward pass
      const forwardResult = await this.runtime.forward(
        lastTokenId,
        this._getDummyEmbeddings(),
        this._getDummyLayers(),
        this._getDummyOutputWeights()
      );

      const logits = forwardResult.logits;

      // Softmax
      const probs = this.runtime.softmax(logits);

      // Sample next token
      const nextTokenId = this.runtime.sample(probs, temperature, topK);

      // Check stopping conditions
      if (stopOnEOS && this.stopTokens.has(nextTokenId)) {
        console.log(`[Generate] EOS token (${nextTokenId}) reached`);
        break;
      }

      // Add token to sequence
      outputTokens.push(nextTokenId);

      // Decode token
      const tokenStr = this.tokenizer.idToToken(nextTokenId);
      generatedText += tokenStr;

      // Update stats
      this.generationStats.tokens_generated++;

      // Callback
      if (onToken) {
        onToken({
          token_id: nextTokenId,
          token: tokenStr,
          step: step,
          text_so_far: generatedText,
          confidence: Math.max(...probs)
        });
      }

      // Log progress every 10 tokens
      if ((step + 1) % 10 === 0) {
        const elapsed = (performance.now() - this.generationStats.start_time) / 1000;
        const tokensPerSec = this.generationStats.tokens_generated / elapsed;
        console.log(`[Generate] Token ${step + 1}/${maxTokens} (${tokensPerSec.toFixed(1)} tokens/sec)`);
      }
    }

    // Finalize
    const totalTime = performance.now() - this.generationStats.start_time;
    this.generationStats.total_generation_time = totalTime;
    this.generationStats.tokens_per_second = (this.generationStats.tokens_generated * 1000) / totalTime;

    // Decode full output
    const finalText = this.tokenizer.decode(outputTokens);

    console.log('-'.repeat(60));
    console.log('Generation Complete');
    console.log(`Tokens generated: ${this.generationStats.tokens_generated}`);
    console.log(`Time: ${totalTime.toFixed(0)}ms`);
    console.log(`Speed: ${this.generationStats.tokens_per_second.toFixed(1)} tokens/sec`);
    console.log('='.repeat(60));

    return {
      text: finalText,
      tokens: outputTokens,
      generated_tokens: this.generationStats.tokens_generated,
      time_ms: totalTime,
      tokens_per_second: this.generationStats.tokens_per_second,
      prompt: prompt,
      temperature: temperature,
      topK: topK
    };
  }

  /**
   * Generate with streaming (for real-time display)
   */
  async generateStream(prompt, maxTokens = 100, temperature = 0.7, onChunk = null) {
    return this.generate(prompt, {
      maxTokens,
      temperature,
      stopOnEOS: true,
      onToken: onChunk ? (tokenInfo) => {
        onChunk(tokenInfo.token);
      } : null
    });
  }

  /**
   * Continue generation from existing tokens
   */
  async continueGeneration(tokenIds, maxNewTokens = 50, temperature = 0.7) {
    console.log(`[Continue] Generating ${maxNewTokens} more tokens...`);

    let outputTokens = [...tokenIds];
    let generatedText = '';

    for (let step = 0; step < maxNewTokens; step++) {
      const lastTokenId = outputTokens[outputTokens.length - 1];

      const forwardResult = await this.runtime.forward(
        lastTokenId,
        this._getDummyEmbeddings(),
        this._getDummyLayers(),
        this._getDummyOutputWeights()
      );

      const logits = forwardResult.logits;
      const probs = this.runtime.softmax(logits);
      const nextTokenId = this.runtime.sample(probs, temperature);

      if (this.stopTokens.has(nextTokenId)) break;

      outputTokens.push(nextTokenId);
      generatedText += this.tokenizer.idToToken(nextTokenId);
    }

    return {
      tokens: outputTokens,
      generated_text: generatedText
    };
  }

  /**
   * Batch generation (multiple prompts in parallel)
   */
  async generateBatch(prompts, maxTokens = 50, temperature = 0.7) {
    console.log(`[Batch] Generating for ${prompts.length} prompts...`);

    const results = [];

    for (const prompt of prompts) {
      const result = await this.generate(prompt, {
        maxTokens,
        temperature,
        stopOnEOS: true
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Inject Crown context into prompt
   */
  withCrown(crownData, prompt) {
    // Format Crown context
    let crownContext = '';

    if (crownData.config) {
      crownContext += `[System]: ${crownData.config.systemPrompt || ''}\n`;

      if (crownData.config.specializations && crownData.config.specializations.length > 0) {
        crownContext += `[Specializations]: ${crownData.config.specializations.join(', ')}\n`;
      }

      if (crownData.config.temperature !== undefined) {
        crownContext += `[Temperature]: ${crownData.config.temperature}\n`;
      }

      crownContext += `[Personality]: ${crownData.config.personality || 'neutral'}\n`;
    }

    // Add knowledge sections if present
    if (crownData.knowledge) {
      if (crownData.knowledge.documents) {
        crownContext += `\n[Knowledge]:\n`;
        const docSummary = crownData.knowledge.documents
          .slice(0, 3)  // First 3 docs
          .map(d => d.excerpt || d.content || d.name)
          .join('\n');
        crownContext += docSummary;
      }
    }

    return {
      crownContext,
      fullPrompt: `${crownContext}\n\n${prompt}`
    };
  }

  /**
   * Evaluate prompt perplexity
   */
  async evaluatePerplexity(text) {
    const tokenIds = this.tokenizer.encode(text);
    let totalLogProb = 0.0;
    let numTokens = 0;

    console.log(`[Perplexity] Evaluating ${tokenIds.length} tokens...`);

    for (let i = 0; i < tokenIds.length - 1; i++) {
      const tokenId = tokenIds[i];

      const forwardResult = await this.runtime.forward(
        tokenId,
        this._getDummyEmbeddings(),
        this._getDummyLayers(),
        this._getDummyOutputWeights()
      );

      const logits = forwardResult.logits;
      const probs = this.runtime.softmax(logits);

      const nextTokenId = tokenIds[i + 1];
      const logProb = Math.log(probs[nextTokenId] || 1e-10);

      totalLogProb += logProb;
      numTokens++;
    }

    const avgLogProb = totalLogProb / numTokens;
    const perplexity = Math.exp(-avgLogProb);

    console.log(`[Perplexity] Perplexity: ${perplexity.toFixed(2)}`);

    return {
      perplexity: perplexity,
      avg_log_prob: avgLogProb,
      num_tokens: numTokens
    };
  }

  /**
   * Get generation statistics
   */
  getStats() {
    return {
      ...this.generationStats,
      model_config: this.config,
      tokenizer_vocab_size: this.tokenizer.vocabSize
    };
  }

  /**
   * Dummy data helpers (in real code, would use actual model data)
   */
  _getDummyEmbeddings() {
    const vocabSize = this.config.vocab_size;
    const hiddenSize = this.config.hidden_size;
    const embeddings = new Float32Array(vocabSize * hiddenSize);

    // Fill with random values (deterministic based on indices)
    for (let i = 0; i < embeddings.length; i++) {
      embeddings[i] = (Math.sin(i * 0.01) + Math.cos(i * 0.02)) * 0.1;
    }

    return embeddings;
  }

  _getDummyLayers() {
    const layers = [];

    for (let layerIdx = 0; layerIdx < this.config.num_layers; layerIdx++) {
      layers.push({
        attn_q: new Float32Array(64),
        attn_k: new Float32Array(64),
        attn_v: new Float32Array(64),
        attn_out: new Float32Array(64),
        mlp_in: new Float32Array(256),
        mlp_out: new Float32Array(256),
        norm1: new Float32Array(this.config.hidden_size),
        norm2: new Float32Array(this.config.hidden_size)
      });
    }

    return layers;
  }

  _getDummyOutputWeights() {
    const hiddenSize = this.config.hidden_size;
    const vocabSize = this.config.vocab_size;
    const weights = new Float32Array(vocabSize * hiddenSize);

    for (let i = 0; i < weights.length; i++) {
      weights[i] = (Math.sin(i * 0.001) * 0.01);
    }

    return weights;
  }

  /**
   * Print generator information
   */
  printInfo() {
    console.log('='.repeat(60));
    console.log('Text Generator Information');
    console.log('='.repeat(60));
    console.log(`Model Layers:         ${this.config.num_layers}`);
    console.log(`Hidden Size:          ${this.config.hidden_size}`);
    console.log(`Vocabulary Size:      ${this.tokenizer.vocabSize}`);
    console.log(`Max Sequence Length:  ${this.config.max_seq_len}`);
    console.log('-'.repeat(60));
    console.log(`Tokens Generated:     ${this.generationStats.tokens_generated}`);

    if (this.generationStats.tokens_per_second > 0) {
      console.log(`Generation Speed:     ${this.generationStats.tokens_per_second.toFixed(1)} tokens/sec`);
      console.log(`Total Time:           ${this.generationStats.total_generation_time.toFixed(0)}ms`);
    }

    console.log('='.repeat(60));
  }
}

/**
 * Create text generator from model and tokenizer
 */
export async function createTextGenerator(modelPath, tokenizerPath = null, runtimeConfig = null) {
  console.log('[Setup] Loading text generator...');

  // Load model
  const modelLoader = new SCXModelLoader();
  const model = await modelLoader.loadFromJSON(modelPath);

  // Load tokenizer
  const tokenizer = new BPETokenizer();
  if (tokenizerPath) {
    tokenizer.loadFromJSON(tokenizerPath);
  }

  // Create runtime
  const runtime = new InferenceRuntime(model.getConfig());
  await runtime.init();

  // Create generator
  const generator = new TextGenerator(model, tokenizer, runtime);

  console.log('[Setup] ✓ Text generator ready');

  return generator;
}

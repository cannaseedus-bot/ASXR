/**
 * MICRONAUT HANDLERS
 * Lightweight AI inference using n-gram models
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Brain models cache
let brainModels = {
  trigrams: null,
  bigrams: null,
  intents: null
};

// Load brain models
const loadBrains = async () => {
  const brainsDir = path.resolve(__dirname, '../../micronaut/brains');

  try {
    if (!brainModels.trigrams) {
      const trigramPath = path.join(brainsDir, 'trigrams.json');
      if (await fs.pathExists(trigramPath)) {
        brainModels.trigrams = await fs.readJson(trigramPath);
      }
    }

    if (!brainModels.bigrams) {
      const bigramPath = path.join(brainsDir, 'bigrams.json');
      if (await fs.pathExists(bigramPath)) {
        brainModels.bigrams = await fs.readJson(bigramPath);
      }
    }

    if (!brainModels.intents) {
      const intentPath = path.join(brainsDir, 'meta-intent-map.json');
      if (await fs.pathExists(intentPath)) {
        brainModels.intents = await fs.readJson(intentPath);
      }
    }
  } catch (err) {
    console.warn('Brain models not yet trained:', err.message);
  }

  return brainModels;
};

export default {
  /**
   * Infer - Generate text completion
   */
  micronaut_infer: async ({ input }) => {
    const { prompt, max_tokens = 50, temperature = 0.7 } = input;

    await loadBrains();

    if (!brainModels.trigrams && !brainModels.bigrams) {
      return {
        error: 'Brain models not loaded',
        note: 'Run training scripts in /micronaut/training/',
        completion: ''
      };
    }

    // Generate using n-gram model
    const completion = generateCompletion(prompt, max_tokens, temperature);

    return {
      success: true,
      prompt,
      completion,
      model: 'micronaut-ngram',
      tokens: completion.split(/\s+/).length
    };
  },

  /**
   * Intent - Classify intent
   */
  micronaut_intent: async ({ input }) => {
    const { text } = input;

    await loadBrains();

    if (!brainModels.intents) {
      return {
        error: 'Intent model not loaded',
        intent: 'unknown',
        confidence: 0
      };
    }

    // Simple intent classification
    const intent = classifyIntent(text, brainModels.intents);

    return {
      success: true,
      text,
      intent: intent.name,
      confidence: intent.confidence,
      alternatives: intent.alternatives
    };
  },

  /**
   * Complete - Code completion
   */
  micronaut_complete: async ({ input }) => {
    const { code, language = 'javascript', max_suggestions = 3 } = input;

    await loadBrains();

    // Generate code suggestions
    const suggestions = generateCodeSuggestions(code, language, max_suggestions);

    return {
      success: true,
      code,
      language,
      suggestions
    };
  },

  /**
   * Chat - Conversational response
   */
  micronaut_chat: async ({ input }) => {
    const { message, context = [] } = input;

    await loadBrains();

    // Generate chat response
    const response = generateChatResponse(message, context);

    return {
      success: true,
      message,
      response,
      model: 'micronaut-chat'
    };
  },

  /**
   * Train - Trigger model training
   */
  micronaut_train: async ({ input }) => {
    const { model_type = 'trigrams', dataset } = input;

    return {
      error: 'Training not yet implemented in server',
      note: 'Run training scripts directly: node micronaut/training/train-trigrams.js',
      model_type
    };
  },

  /**
   * Status - Get Micronaut status
   */
  micronaut_status: async ({ input }) => {
    await loadBrains();

    return {
      status: 'online',
      models: {
        trigrams: brainModels.trigrams ? 'loaded' : 'not loaded',
        bigrams: brainModels.bigrams ? 'loaded' : 'not loaded',
        intents: brainModels.intents ? 'loaded' : 'not loaded'
      },
      capabilities: [
        'text_completion',
        'intent_classification',
        'code_completion',
        'chat_response'
      ]
    };
  }
};

// Helper functions
function generateCompletion(prompt, maxTokens, temperature) {
  // Mock completion - in production, use actual n-gram model
  const words = prompt.split(/\s+/);
  const lastWord = words[words.length - 1];

  // Simple completion based on last word
  const completions = {
    'the': 'system is working',
    'function': 'returns a value',
    'create': 'a new instance',
    'implement': 'the feature',
    'use': 'the API endpoint'
  };

  return completions[lastWord.toLowerCase()] || 'completion not available';
}

function classifyIntent(text, intents) {
  // Mock intent classification
  const lowerText = text.toLowerCase();

  const patterns = {
    'create': { name: 'create', confidence: 0.9 },
    'delete': { name: 'delete', confidence: 0.9 },
    'update': { name: 'update', confidence: 0.85 },
    'get': { name: 'read', confidence: 0.8 },
    'list': { name: 'list', confidence: 0.85 },
    'help': { name: 'help', confidence: 0.95 }
  };

  for (const [keyword, result] of Object.entries(patterns)) {
    if (lowerText.includes(keyword)) {
      return {
        ...result,
        alternatives: []
      };
    }
  }

  return {
    name: 'unknown',
    confidence: 0.3,
    alternatives: ['help', 'create', 'read']
  };
}

function generateCodeSuggestions(code, language, maxSuggestions) {
  // Mock code suggestions
  const suggestions = [];

  if (code.includes('function')) {
    suggestions.push({
      text: 'function name() { }',
      type: 'function',
      confidence: 0.8
    });
  }

  if (code.includes('const')) {
    suggestions.push({
      text: 'const variable = value;',
      type: 'variable',
      confidence: 0.75
    });
  }

  if (code.includes('import')) {
    suggestions.push({
      text: 'import { module } from \'package\';',
      type: 'import',
      confidence: 0.7
    });
  }

  return suggestions.slice(0, maxSuggestions);
}

function generateChatResponse(message, context) {
  // Mock chat response
  const responses = {
    'hello': 'Hello! How can I help you today?',
    'hi': 'Hi there!',
    'help': 'I can assist with code completion, intent classification, and text generation.',
    'thanks': 'You\'re welcome!',
    'bye': 'Goodbye!'
  };

  const lowerMessage = message.toLowerCase();
  for (const [keyword, response] of Object.entries(responses)) {
    if (lowerMessage.includes(keyword)) {
      return response;
    }
  }

  return 'I understand. How can I assist you further?';
}

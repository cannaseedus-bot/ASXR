/**
 * Crown-GPT Bridge
 *
 * Integrates Crown system with browser GPT inference
 * - Loads Crown character roles
 * - Injects context into generation
 * - Manages personality temperature and settings
 * - Formats prompts with system context
 */

export class CrownGPTBridge {
  constructor(textGenerator) {
    this.generator = textGenerator;
    this.crownRegistry = new Map();
    this.currentCrown = null;
    this.contextCache = {};
  }

  /**
   * Register Crown from JSON data
   *
   * Crown structure:
   * {
   *   "name": "dungeon-master",
   *   "type": "character-role",
   *   "config": {
   *     "systemPrompt": "You are a DM...",
   *     "personality": "dramatic",
   *     "temperature": 0.8,
   *     "specializations": ["D&D 5e", "improvisation"]
   *   },
   *   "knowledge": {
   *     "documents": [...],
   *     "code": [...],
   *     "data": [...]
   *   },
   *   "fineTuning": {
   *     "conversations": [...],
   *     "instructions": [...]
   *   }
   * }
   */
  registerCrown(crownData) {
    if (!crownData.name) {
      throw new Error('Crown must have a name');
    }

    const name = crownData.name;
    this.crownRegistry.set(name, crownData);

    console.log(`[Crown] Registered: ${name}`);
    console.log(`        Type: ${crownData.type || 'unknown'}`);
    if (crownData.config) {
      console.log(`        Personality: ${crownData.config.personality || 'unknown'}`);
      console.log(`        Temperature: ${crownData.config.temperature || 0.7}`);
    }

    return this;
  }

  /**
   * Load Crown from JSON file or object
   */
  async loadCrown(crownPathOrData) {
    let crownData;

    if (typeof crownPathOrData === 'string') {
      // Load from file path (Node.js)
      try {
        const fs = await import('fs');
        const data = fs.readFileSync(crownPathOrData, 'utf-8');
        crownData = JSON.parse(data);
      } catch (error) {
        throw new Error(`Failed to load Crown: ${error.message}`);
      }
    } else {
      crownData = crownPathOrData;
    }

    this.registerCrown(crownData);
    this.selectCrown(crownData.name);

    return this;
  }

  /**
   * Select active Crown by name
   */
  selectCrown(crownName) {
    if (!this.crownRegistry.has(crownName)) {
      throw new Error(`Crown not found: ${crownName}`);
    }

    this.currentCrown = this.crownRegistry.get(crownName);

    console.log(`[Crown] Selected: ${crownName}`);
    console.log(`        System: "${this.currentCrown.config.systemPrompt?.substring(0, 50)}..."`);

    return this;
  }

  /**
   * Get current Crown
   */
  getCrown() {
    if (!this.currentCrown) {
      throw new Error('No Crown selected');
    }

    return this.currentCrown;
  }

  /**
   * Format Crown context for AI injection
   *
   * Creates a system prompt section with Crown personality + knowledge
   */
  formatCrownContext(includeKnowledge = true) {
    if (!this.currentCrown) {
      return '';
    }

    let context = '';

    const config = this.currentCrown.config;

    // System prompt
    if (config.systemPrompt) {
      context += `${config.systemPrompt}\n\n`;
    }

    // Personality
    if (config.personality) {
      context += `Personality: You are ${config.personality}.\n`;
    }

    // Specializations
    if (config.specializations && config.specializations.length > 0) {
      context += `Specializations: ${config.specializations.join(', ')}\n`;
    }

    // Knowledge base
    if (includeKnowledge && this.currentCrown.knowledge) {
      const knowledge = this.currentCrown.knowledge;

      if (knowledge.documents && knowledge.documents.length > 0) {
        context += '\nKnowledge Base:\n';

        // Include first few document summaries
        for (let i = 0; i < Math.min(3, knowledge.documents.length); i++) {
          const doc = knowledge.documents[i];
          const summary = doc.excerpt || doc.content || doc.name;
          if (summary) {
            context += `- ${summary.substring(0, 100)}...\n`;
          }
        }
      }

      // Code examples
      if (knowledge.code && knowledge.code.length > 0) {
        context += '\nCode Examples:\n';
        for (let i = 0; i < Math.min(2, knowledge.code.length); i++) {
          const code = knowledge.code[i];
          const name = code.name || code.language || 'example';
          context += `\`\`\`${code.language || 'text'}\n${code.content?.substring(0, 100) || ''}\n\`\`\`\n`;
        }
      }

      // Stats/data
      if (knowledge.data && knowledge.data.length > 0) {
        context += '\nData:\n';
        context += knowledge.data.map(d => `- ${d.name}: ${d.value}`).slice(0, 5).join('\n');
      }
    }

    return context.trim();
  }

  /**
   * Generate with Crown context
   *
   * Automatically injects Crown personality and knowledge
   */
  async generateWithCrown(userPrompt, options = {}) {
    if (!this.currentCrown) {
      throw new Error('No Crown selected');
    }

    const config = this.currentCrown.config;

    // Use Crown temperature if not overridden
    const temperature = options.temperature !== undefined
      ? options.temperature
      : (config.temperature || 0.7);

    // Format Crown context
    const crownContext = this.formatCrownContext(options.includeKnowledge !== false);

    // Generate with context injection
    const result = await this.generator.generate(userPrompt, {
      maxTokens: options.maxTokens || 100,
      temperature: temperature,
      topK: options.topK,
      stopOnEOS: options.stopOnEOS !== false,
      onToken: options.onToken,
      crownContext: crownContext
    });

    // Add Crown info to result
    result.crown_used = {
      name: this.currentCrown.name,
      personality: config.personality,
      temperature: temperature,
      specializations: config.specializations
    };

    return result;
  }

  /**
   * Create character conversation
   *
   * Maintains conversation context across multiple turns
   */
  async conversation(messages = []) {
    if (!this.currentCrown) {
      throw new Error('No Crown selected');
    }

    const conversationHistory = [];

    for (const message of messages) {
      const { role, content } = message;

      if (role === 'user') {
        // Generate response
        const response = await this.generateWithCrown(content);
        conversationHistory.push({
          role: 'user',
          content: content
        });

        conversationHistory.push({
          role: 'assistant',
          content: response.text,
          crown: response.crown_used
        });
      } else if (role === 'system') {
        conversationHistory.push({
          role: 'system',
          content: content
        });
      }
    }

    return conversationHistory;
  }

  /**
   * Analyze prompt for personality match
   *
   * Checks if prompt aligns with Crown personality
   */
  analyzePromptFit(prompt) {
    if (!this.currentCrown) {
      return null;
    }

    const specializations = this.currentCrown.config.specializations || [];
    const personality = this.currentCrown.config.personality || '';

    let score = 0.5;  // Base score

    // Check for keyword matches with specializations
    for (const spec of specializations) {
      if (prompt.toLowerCase().includes(spec.toLowerCase())) {
        score += 0.1;
      }
    }

    // Check for personality keywords
    const personalityKeywords = {
      'dramatic': ['dramatic', 'emotional', 'intense', 'theatrical'],
      'neutral': ['neutral', 'objective', 'factual', 'analytical'],
      'humorous': ['funny', 'joke', 'humor', 'laugh'],
      'serious': ['serious', 'grave', 'critical', 'urgent']
    };

    for (const [type, keywords] of Object.entries(personalityKeywords)) {
      if (personality.includes(type)) {
        for (const keyword of keywords) {
          if (prompt.toLowerCase().includes(keyword)) {
            score += 0.05;
          }
        }
      }
    }

    return {
      fit_score: Math.min(1.0, score),
      specializations_found: specializations.filter(s =>
        prompt.toLowerCase().includes(s.toLowerCase())
      ),
      personality: personality
    };
  }

  /**
   * Get list of registered Crowns
   */
  listCrowns() {
    const crowns = Array.from(this.crownRegistry.entries()).map(([name, data]) => ({
      name: name,
      type: data.type || 'unknown',
      personality: data.config?.personality || 'unknown',
      temperature: data.config?.temperature || 0.7,
      specializations: data.config?.specializations || []
    }));

    return crowns;
  }

  /**
   * Export Crown with all context
   */
  exportCrown(crownName = null) {
    const crown = crownName
      ? this.crownRegistry.get(crownName)
      : this.currentCrown;

    if (!crown) {
      throw new Error('Crown not found');
    }

    return JSON.stringify(crown, null, 2);
  }

  /**
   * Print Crown information
   */
  printCrownInfo() {
    if (!this.currentCrown) {
      console.log('[Crown] No Crown selected');
      return;
    }

    const crown = this.currentCrown;
    const config = crown.config || {};

    console.log('='.repeat(60));
    console.log('Crown Information');
    console.log('='.repeat(60));
    console.log(`Name:                 ${crown.name}`);
    console.log(`Type:                 ${crown.type || 'character-role'}`);
    console.log(`Personality:          ${config.personality || 'unknown'}`);
    console.log(`Temperature:          ${config.temperature || 0.7}`);

    if (config.specializations && config.specializations.length > 0) {
      console.log(`Specializations:      ${config.specializations.join(', ')}`);
    }

    if (config.systemPrompt) {
      console.log(`System Prompt:        "${config.systemPrompt.substring(0, 50)}..."`);
    }

    if (crown.knowledge) {
      const knowledge = crown.knowledge;
      const docCount = knowledge.documents?.length || 0;
      const codeCount = knowledge.code?.length || 0;
      const dataCount = knowledge.data?.length || 0;

      console.log(`Knowledge:            ${docCount} docs, ${codeCount} code, ${dataCount} data`);
    }

    console.log('='.repeat(60));
  }

  /**
   * Print all registered Crowns
   */
  printCrowns() {
    const crowns = this.listCrowns();

    console.log('='.repeat(60));
    console.log('Registered Crowns');
    console.log('='.repeat(60));

    if (crowns.length === 0) {
      console.log('No Crowns registered');
    } else {
      for (const crown of crowns) {
        console.log(`${crown.name.padEnd(20)} | ${crown.personality.padEnd(12)} | temp=${crown.temperature}`);
        if (crown.specializations.length > 0) {
          console.log(`  Specs: ${crown.specializations.join(', ')}`);
        }
      }
    }

    console.log('='.repeat(60));
  }
}

/**
 * Create Crown-GPT bridge
 */
export function createCrownGPTBridge(textGenerator) {
  return new CrownGPTBridge(textGenerator);
}

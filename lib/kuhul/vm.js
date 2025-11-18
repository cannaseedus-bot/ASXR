/**
 * K'uhul Virtual Machine
 * Glyph-based execution engine for high-efficiency shard processing
 *
 * Glyph Reference:
 * Pop    - Push to stack
 * Wo     - Write/assign
 * Ch'en  - Container/variable
 * Yax    - Get/access
 * Sek    - Execute/call
 * Kumk'u - End loop
 * K'ayab'- Begin loop
 * Xul    - End program
 */

export class KuhulVM {
  constructor() {
    this.stack = [];
    this.variables = new Map();
    this.functions = new Map();
    this.glyphs = {
      'Pop': this.gPop.bind(this),
      'Wo': this.gWo.bind(this),
      'Ch\'en': this.gChen.bind(this),
      'Yax': this.gYax.bind(this),
      'Sek': this.gSek.bind(this),
      'K\'ayab\'': this.gKayab.bind(this),
      'Kumk\'u': this.gKumku.bind(this),
      'Xul': this.gXul.bind(this)
    };
  }

  /**
   * Execute K'uhul glyph code
   */
  async execute(code, context = {}) {
    // Initialize context
    Object.entries(context).forEach(([key, value]) => {
      this.variables.set(key, value);
    });

    // Parse glyph code
    const instructions = this.parse(code);

    // Execute instructions
    for (const inst of instructions) {
      if (this.halted) break;

      await this.executeInstruction(inst);
    }

    // Return stack top or variables
    return this.stack.length > 0
      ? this.stack[this.stack.length - 1]
      : Object.fromEntries(this.variables);
  }

  /**
   * Parse glyph code into instructions
   */
  parse(code) {
    if (typeof code !== 'string') {
      // If code is a handler name, return mock instruction
      return [{ glyph: 'Sek', args: [code] }];
    }

    const instructions = [];
    const lines = code.split('\n').map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.startsWith('#')) continue; // Comment

      const match = line.match(/^\[(\w+'?)\s*(.*?)\]$/);
      if (match) {
        const [, glyph, argsStr] = match;
        const args = argsStr
          ? argsStr.split(/\s+/).filter(Boolean)
          : [];

        instructions.push({ glyph, args, raw: line });
      }
    }

    return instructions;
  }

  /**
   * Execute single instruction
   */
  async executeInstruction(inst) {
    const handler = this.glyphs[inst.glyph];

    if (!handler) {
      console.warn(`[K'uhul] Unknown glyph: ${inst.glyph}`);
      return;
    }

    await handler(inst.args);
  }

  // ========================================
  // GLYPH IMPLEMENTATIONS
  // ========================================

  /**
   * Pop - Define function/scope
   */
  async gPop(args) {
    const funcName = args[0];
    if (funcName) {
      this.currentFunction = funcName;
      this.functions.set(funcName, []);
    }
  }

  /**
   * Wo - Write/assign value
   */
  async gWo(args) {
    let value = args.join(' ');

    // Parse value
    if (value.startsWith('"') || value.startsWith("'")) {
      value = value.slice(1, -1);
    } else if (value === 'true' || value === 'false') {
      value = value === 'true';
    } else if (!isNaN(value)) {
      value = parseFloat(value);
    } else if (value.startsWith('{') || value.startsWith('[')) {
      value = JSON.parse(value);
    }

    this.stack.push(value);
  }

  /**
   * Ch'en - Create container/variable
   */
  async gChen(args) {
    const varName = args[0];
    const value = this.stack.pop();

    if (varName) {
      this.variables.set(varName, value);
    } else {
      this.stack.push(value); // Keep on stack if no name
    }
  }

  /**
   * Yax - Access/get value
   */
  async gYax(args) {
    const varName = args[0];
    const value = this.variables.get(varName);

    if (value !== undefined) {
      this.stack.push(value);
    } else {
      console.warn(`[K'uhul] Variable not found: ${varName}`);
      this.stack.push(null);
    }
  }

  /**
   * Sek - Execute/call function
   */
  async gSek(args) {
    const operation = args.join(' ');

    // Handle built-in operations
    if (operation.startsWith('"') || operation.startsWith("'")) {
      // String literal - push to stack
      this.stack.push(operation.slice(1, -1));
      return;
    }

    // Common operations
    switch (operation) {
      case 'get':
        // Get property from object
        const key = args[1];
        const obj = this.stack.pop();
        this.stack.push(obj?.[key] || null);
        break;

      case 'for_each':
      case 'forEach':
        // Iterate array
        const fn = args[1];
        const arr = this.stack.pop();
        if (Array.isArray(arr)) {
          for (const item of arr) {
            this.variables.set('item', item);
            await this.execute(fn, Object.fromEntries(this.variables));
          }
        }
        break;

      case 'scx_decompress':
      case 'xjson_parse':
      case 'xj_compile_view':
      case 'register_virtual_api':
      case 'start_virtual_server':
        // Mock operations for now
        const input = this.stack.pop();
        this.stack.push(input);
        break;

      case 'process':
      case 'process_data':
      case 'send_response':
        // Processing operations
        const data = this.stack.pop();
        this.stack.push({ processed: true, data });
        break;

      default:
        // Custom function call
        if (this.functions.has(operation)) {
          const func = this.functions.get(operation);
          await this.execute(func.join('\n'), Object.fromEntries(this.variables));
        } else {
          // Return operation result
          this.stack.push({ operation, executed: true });
        }
    }
  }

  /**
   * K'ayab' - Begin loop
   */
  async gKayab(args) {
    const loopName = args[0];
    this.loopContext = { name: loopName, iterations: 0 };
  }

  /**
   * Kumk'u - End loop
   */
  async gKumku(args) {
    this.loopContext = null;
  }

  /**
   * Xul - End program
   */
  async gXul(args) {
    this.halted = true;
  }
}

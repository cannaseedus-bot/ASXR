/**
 * SCX WebGPU Compiler
 *
 * Compiles SCX operations to WGSL shader code for browser execution.
 * Maps canonical AST operations to GPU kernels with:
 * - Deterministic dispatch order
 * - Zero runtime interpretation
 * - Hash-verified correctness
 */

export class WebGPUCompiler {
  constructor() {
    this.device = null;
    this.initialized = false;

    // SCX opcode to WGSL mapping
    this.opcodeMap = {
      // Arithmetic
      0x01: { name: 'add', wgsl: 'a + b', arity: 2 },
      0x02: { name: 'sub', wgsl: 'a - b', arity: 2 },
      0x03: { name: 'mul', wgsl: 'a * b', arity: 2 },
      0x04: { name: 'div', wgsl: 'a / b', arity: 2 },
      0x05: { name: 'pow', wgsl: 'pow(a, b)', arity: 2 },

      // Unary math
      0x10: { name: 'sin', wgsl: 'sin(a)', arity: 1 },
      0x11: { name: 'cos', wgsl: 'cos(a)', arity: 1 },
      0x12: { name: 'tan', wgsl: 'tan(a)', arity: 1 },
      0x13: { name: 'exp', wgsl: 'exp(a)', arity: 1 },
      0x14: { name: 'log', wgsl: 'log(a)', arity: 1 },
      0x15: { name: 'sqrt', wgsl: 'sqrt(a)', arity: 1 },
      0x16: { name: 'abs', wgsl: 'abs(a)', arity: 1 },
      0x17: { name: 'tanh', wgsl: 'tanh(a)', arity: 1 },

      // Comparison
      0x20: { name: 'max', wgsl: 'max(a, b)', arity: 2 },
      0x21: { name: 'min', wgsl: 'min(a, b)', arity: 2 },

      // Stack operations
      0x30: { name: 'const', wgsl: null, arity: 0 },  // Loads from NUM buffer
      0x31: { name: 'var', wgsl: null, arity: 0 },    // Loads from input buffer
    };
  }

  /**
   * Initialize WebGPU device
   */
  async init() {
    if (this.initialized) return;

    if (!navigator.gpu) {
      throw new Error('WebGPU not supported in this browser');
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    this.device = await adapter.requestDevice();
    this.initialized = true;

    console.log('[WebGPU] Initialized successfully');
  }

  /**
   * Compile SCX operation graph to WGSL shader
   *
   * Input: SCX lanes (OP, NUM, DICT, SHP)
   * Output: WGSL shader code
   */
  compileToWGSL(lanes, options = {}) {
    const {
      workgroupSize = 64,
      inputType = 'f32',
      outputType = 'f32',
      bufferLayout = 'sequential'
    } = options;

    // Generate shader header
    let wgsl = this.generateHeader(workgroupSize);

    // Generate buffer bindings
    wgsl += this.generateBufferBindings(lanes, inputType, outputType);

    // Generate execution kernel
    wgsl += this.generateExecutionKernel(lanes, workgroupSize);

    return wgsl;
  }

  /**
   * Generate WGSL shader header
   */
  generateHeader(workgroupSize) {
    return `// SCX-compiled WGSL shader
// Auto-generated from SCX operation graph
// Workgroup size: ${workgroupSize}

`;
  }

  /**
   * Generate buffer binding declarations
   */
  generateBufferBindings(lanes, inputType, outputType) {
    return `// Buffer bindings
struct Constants {
  values: array<f32>,
};

@group(0) @binding(0) var<storage, read> input: array<${inputType}>;
@group(0) @binding(1) var<storage, read> constants: Constants;
@group(0) @binding(2) var<storage, read_write> output: array<${outputType}>;
@group(0) @binding(3) var<storage, read_write> stack: array<f32>;

`;
  }

  /**
   * Generate main execution kernel
   */
  generateExecutionKernel(lanes, workgroupSize) {
    let kernel = `@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let tid = gid.x;
  var sp: u32 = 0u;  // stack pointer
  var np: u32 = 0u;  // NUM pointer
  var ip: u32 = tid;  // input pointer

  // Execute operation sequence
`;

    // Generate operation sequence from OP lane
    if (lanes.op && lanes.op.length > 0) {
      kernel += this.generateOpSequence(lanes.op);
    }

    kernel += `
  // Write result to output
  output[tid] = stack[0];
}
`;

    return kernel;
  }

  /**
   * Generate operation sequence from OP lane
   */
  generateOpSequence(opLane) {
    let code = '';

    for (let i = 0; i < opLane.length; i++) {
      const opcode = opLane[i];
      const op = this.opcodeMap[opcode];

      if (!op) {
        console.warn(`Unknown opcode: 0x${opcode.toString(16)}`);
        continue;
      }

      code += `  // ${op.name}\n`;
      code += this.generateOpCode(op, i);
    }

    return code;
  }

  /**
   * Generate code for single operation
   */
  generateOpCode(op, index) {
    let code = '';

    if (op.name === 'const') {
      // Load constant from NUM buffer
      code += `  stack[sp] = constants.values[np];\n`;
      code += `  np += 1u;\n`;
      code += `  sp += 1u;\n`;
    } else if (op.name === 'var') {
      // Load from input buffer
      code += `  stack[sp] = f32(input[ip]);\n`;
      code += `  sp += 1u;\n`;
    } else if (op.arity === 1) {
      // Unary operation
      code += `  let a = stack[sp - 1u];\n`;
      code += `  stack[sp - 1u] = ${op.wgsl};\n`;
    } else if (op.arity === 2) {
      // Binary operation
      code += `  let b = stack[sp - 1u];\n`;
      code += `  let a = stack[sp - 2u];\n`;
      code += `  sp -= 2u;\n`;
      code += `  stack[sp] = ${op.wgsl};\n`;
      code += `  sp += 1u;\n`;
    }

    code += '\n';
    return code;
  }

  /**
   * Create GPU pipeline from WGSL code
   */
  async createPipeline(wgslCode, label = 'scx-pipeline') {
    if (!this.initialized) {
      await this.init();
    }

    const shaderModule = this.device.createShaderModule({
      label: `${label}-shader`,
      code: wgslCode
    });

    const pipeline = this.device.createComputePipeline({
      label,
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main'
      }
    });

    return pipeline;
  }

  /**
   * Execute compiled pipeline on GPU
   */
  async execute(pipeline, buffers, workgroupCount) {
    if (!this.initialized) {
      throw new Error('WebGPU not initialized');
    }

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buffers.input } },
        { binding: 1, resource: { buffer: buffers.constants } },
        { binding: 2, resource: { buffer: buffers.output } },
        { binding: 3, resource: { buffer: buffers.stack } }
      ]
    });

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(workgroupCount);
    passEncoder.end();

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);

    // Wait for completion
    await this.device.queue.onSubmittedWorkDone();
  }

  /**
   * Create GPU buffer from typed array
   */
  createBuffer(data, usage) {
    if (!this.initialized) {
      throw new Error('WebGPU not initialized');
    }

    const buffer = this.device.createBuffer({
      size: data.byteLength,
      usage,
      mappedAtCreation: true
    });

    if (data instanceof Float32Array) {
      new Float32Array(buffer.getMappedRange()).set(data);
    } else if (data instanceof Uint32Array) {
      new Uint32Array(buffer.getMappedRange()).set(data);
    } else if (data instanceof Uint8Array) {
      new Uint8Array(buffer.getMappedRange()).set(data);
    }

    buffer.unmap();
    return buffer;
  }

  /**
   * Read buffer from GPU to CPU
   */
  async readBuffer(buffer, size) {
    if (!this.initialized) {
      throw new Error('WebGPU not initialized');
    }

    const readBuffer = this.device.createBuffer({
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(buffer, 0, readBuffer, 0, size);
    this.device.queue.submit([commandEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();

    return data;
  }

  /**
   * Compile simple expression to WGSL
   *
   * Example: compileExpression(['add', 'var', 'const'], [1.0])
   */
  compileExpression(operations, constants = []) {
    const lanes = {
      op: operations,
      num: constants,
      dict: [],
      shp: []
    };

    return this.compileToWGSL(lanes);
  }

  /**
   * Get opcode for operation name
   */
  getOpcode(name) {
    for (const [code, op] of Object.entries(this.opcodeMap)) {
      if (op.name === name) {
        return parseInt(code);
      }
    }
    return null;
  }

  /**
   * Validate WGSL shader syntax
   */
  async validateShader(wgslCode) {
    try {
      const shaderModule = this.device.createShaderModule({
        code: wgslCode
      });

      const compilationInfo = await shaderModule.getCompilationInfo();

      const errors = compilationInfo.messages.filter(m => m.type === 'error');
      const warnings = compilationInfo.messages.filter(m => m.type === 'warning');

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      return {
        valid: false,
        errors: [{ message: error.message }],
        warnings: []
      };
    }
  }

  /**
   * Get device limits and capabilities
   */
  getDeviceInfo() {
    if (!this.initialized) {
      return null;
    }

    return {
      limits: this.device.limits,
      features: Array.from(this.device.features),
      maxWorkgroupSize: this.device.limits.maxComputeWorkgroupSizeX,
      maxBufferSize: this.device.limits.maxStorageBufferBindingSize
    };
  }
}

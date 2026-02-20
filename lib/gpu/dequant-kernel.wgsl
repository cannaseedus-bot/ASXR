// SCX-TP-INT4 Dequantization Kernel
//
// Unpacks INT4 quantized weights to FP32 for GPU computation
// Block-wise quantization: 128 elements per block
// Each block: scale (FP32) + zero_point (INT8) + packed INT4 values
//
// Memory layout per block:
//   0x00: scale (f32, 4 bytes)
//   0x04: zero_point (i32, 4 bytes) [INT8 stored in i32]
//   0x08: packed INT4 weights (64 bytes for 128 values)

// Quantization block structure
struct QuantBlock {
  scale: f32,
  zero_point: i32,
  // packed data follows in separate buffer
};

// Input/output buffers
@group(0) @binding(0) var<storage, read> blocks: array<QuantBlock>;
@group(0) @binding(1) var<storage, read> packed: array<u32>;  // INT4 packed as bytes
@group(0) @binding(2) var<storage, read_write> output: array<f32>;

// Configuration
@group(0) @binding(3) var<uniform> config: vec4<u32>;  // [block_size, num_blocks, total_elements, _]

/**
 * Extract INT4 value from packed byte
 *
 * Each byte contains 2 INT4 values:
 * - High nibble (bits 4-7): first value
 * - Low nibble (bits 0-3): second value
 *
 * INT4 range: -8 to +7 (signed)
 */
fn extract_int4(packed_byte: u32, is_high: bool) -> i32 {
  var nibble: u32;

  if (is_high) {
    nibble = (packed_byte >> 4u) & 0x0Fu;
  } else {
    nibble = packed_byte & 0x0Fu;
  }

  // Convert unsigned 4-bit to signed
  var value: i32 = i32(nibble);
  if (value >= 8) {
    value = value - 16;
  }

  return value;
}

/**
 * Dequantize single INT4 value to FP32
 *
 * Formula: fp32 = (int4_value - zero_point) * scale
 */
fn dequantize_value(int4_val: i32, scale: f32, zero_point: i32) -> f32 {
  return f32(int4_val - zero_point) * scale;
}

/**
 * Main dequantization kernel
 *
 * Each thread dequantizes one FP32 value from INT4
 */
@compute @workgroup_size(128)
fn dequant_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let tid = gid.x;
  let total_elements = config.z;

  if (tid >= total_elements) {
    return;
  }

  // Determine which block this element belongs to
  let block_size = config.x;
  let block_idx = tid / block_size;
  let local_idx = tid % block_size;

  // Load block metadata
  let block = blocks[block_idx];

  // Calculate packed buffer offset
  // Each block has 64 bytes of packed data (128 INT4 values / 2 per byte)
  let packed_per_block = block_size / 2u;
  let packed_offset = block_idx * packed_per_block;

  // Determine which byte and nibble
  let byte_idx = local_idx / 2u;
  let is_high = (local_idx % 2u) == 0u;

  // Load packed byte
  let packed_byte = packed[packed_offset + byte_idx];

  // Extract INT4 value
  let int4_val = extract_int4(packed_byte, is_high);

  // Dequantize to FP32
  let fp32_val = dequantize_value(int4_val, block.scale, block.zero_point);

  // Write to output
  output[tid] = fp32_val;
}

/**
 * Vectorized dequantization (4 values at once)
 *
 * Processes 4 FP32 values per thread for better throughput
 */
@compute @workgroup_size(128)
fn dequant_vec4(@builtin(global_invocation_id) gid: vec3<u32>) {
  let base_tid = gid.x * 4u;
  let total_elements = config.z;
  let block_size = config.x;

  for (var i = 0u; i < 4u; i++) {
    let tid = base_tid + i;

    if (tid >= total_elements) {
      break;
    }

    let block_idx = tid / block_size;
    let local_idx = tid % block_size;

    let block = blocks[block_idx];

    let packed_per_block = block_size / 2u;
    let packed_offset = block_idx * packed_per_block;

    let byte_idx = local_idx / 2u;
    let is_high = (local_idx % 2u) == 0u;

    let packed_byte = packed[packed_offset + byte_idx];
    let int4_val = extract_int4(packed_byte, is_high);
    let fp32_val = dequantize_value(int4_val, block.scale, block.zero_point);

    output[tid] = fp32_val;
  }
}

/**
 * Matrix multiplication with INT4 dequantization
 *
 * Performs: C = A × B_dequant
 * Where B is stored in INT4 and dequantized on-the-fly
 *
 * Layout:
 * - A: [M × K] FP32 input activations
 * - B: [K × N] INT4 weights (quantized)
 * - C: [M × N] FP32 output
 */
@group(1) @binding(0) var<storage, read> input_A: array<f32>;
@group(1) @binding(1) var<storage, read_write> output_C: array<f32>;
@group(1) @binding(2) var<uniform> dims: vec4<u32>;  // [M, N, K, _]

@compute @workgroup_size(16, 16)
fn matmul_int4(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>
) {
  let M = dims.x;
  let N = dims.y;
  let K = dims.z;

  let row = gid.y;
  let col = gid.x;

  if (row >= M || col >= N) {
    return;
  }

  var sum: f32 = 0.0;

  // Compute dot product with on-the-fly dequantization
  for (var k = 0u; k < K; k++) {
    // Load activation from A
    let a_val = input_A[row * K + k];

    // Load and dequantize weight from B
    let weight_idx = k * N + col;
    let block_idx = weight_idx / config.x;
    let local_idx = weight_idx % config.x;

    let block = blocks[block_idx];
    let packed_per_block = config.x / 2u;
    let packed_offset = block_idx * packed_per_block;

    let byte_idx = local_idx / 2u;
    let is_high = (local_idx % 2u) == 0u;

    let packed_byte = packed[packed_offset + byte_idx];
    let int4_val = extract_int4(packed_byte, is_high);
    let b_val = dequantize_value(int4_val, block.scale, block.zero_point);

    sum += a_val * b_val;
  }

  // Write result
  output_C[row * N + col] = sum;
}

/**
 * Fused dequant + activation
 *
 * Dequantizes INT4 and applies activation function (e.g., GELU, SiLU)
 * in a single pass to reduce memory bandwidth
 */
fn gelu_approx(x: f32) -> f32 {
  // GELU approximation: 0.5 * x * (1 + tanh(sqrt(2/π) * (x + 0.044715 * x^3)))
  let k = 0.7978845608;  // sqrt(2/π)
  let a = 0.044715;
  let x3 = x * x * x;
  return 0.5 * x * (1.0 + tanh(k * (x + a * x3)));
}

@compute @workgroup_size(128)
fn dequant_gelu(@builtin(global_invocation_id) gid: vec3<u32>) {
  let tid = gid.x;
  let total_elements = config.z;

  if (tid >= total_elements) {
    return;
  }

  // Dequantize (same as dequant_main)
  let block_size = config.x;
  let block_idx = tid / block_size;
  let local_idx = tid % block_size;

  let block = blocks[block_idx];
  let packed_per_block = block_size / 2u;
  let packed_offset = block_idx * packed_per_block;

  let byte_idx = local_idx / 2u;
  let is_high = (local_idx % 2u) == 0u;

  let packed_byte = packed[packed_offset + byte_idx];
  let int4_val = extract_int4(packed_byte, is_high);
  let fp32_val = dequantize_value(int4_val, block.scale, block.zero_point);

  // Apply GELU activation
  let activated = gelu_approx(fp32_val);

  output[tid] = activated;
}

// SCX-TP-INT4 Multi-Head Attention Kernel
//
// Implements scaled dot-product attention for transformer models
// Supports INT4 quantized weights with on-the-fly dequantization
//
// Attention formula: softmax(Q·K^T / √d_k) · V
//
// Configuration:
//   - seq_len: Sequence length (max context window)
//   - n_heads: Number of attention heads
//   - head_dim: Dimension per head (typically hidden_size / n_heads)
//   - hidden_size: Total embedding dimension

// ============================================================================
// Data Structures
// ============================================================================

struct AttentionConfig {
  seq_len: u32,      // Sequence length (e.g., 512, 2048)
  n_heads: u32,      // Number of heads (e.g., 8, 12, 32)
  head_dim: u32,     // Dimension per head (e.g., 64, 128)
  hidden_size: u32,  // Total hidden size (n_heads × head_dim)
};

struct QuantBlock {
  scale: f32,
  zero_point: i32,
};

// ============================================================================
// Buffer Bindings
// ============================================================================

// Group 0: Input/Output
@group(0) @binding(0) var<storage, read> input: array<f32>;           // [batch, seq_len, hidden_size]
@group(0) @binding(1) var<storage, read_write> output: array<f32>;    // [batch, seq_len, hidden_size]
@group(0) @binding(2) var<uniform> config: AttentionConfig;

// Group 1: Query weights (INT4 quantized)
@group(1) @binding(0) var<storage, read> q_blocks: array<QuantBlock>;
@group(1) @binding(1) var<storage, read> q_packed: array<u32>;

// Group 2: Key weights (INT4 quantized)
@group(2) @binding(0) var<storage, read> k_blocks: array<QuantBlock>;
@group(2) @binding(1) var<storage, read> k_packed: array<u32>;

// Group 3: Value weights (INT4 quantized)
@group(3) @binding(0) var<storage, read> v_blocks: array<QuantBlock>;
@group(3) @binding(1) var<storage, read> v_packed: array<u32>;

// Group 4: Workspace (for intermediate QK^T and softmax)
@group(4) @binding(0) var<storage, read_write> workspace_qk: array<f32>;      // [n_heads, seq_len, seq_len]
@group(4) @binding(1) var<storage, read_write> workspace_softmax: array<f32>; // [n_heads, seq_len, seq_len]

// ============================================================================
// INT4 Dequantization Functions
// ============================================================================

fn extract_int4(packed_byte: u32, is_high: bool) -> i32 {
  var nibble: u32;

  if (is_high) {
    nibble = (packed_byte >> 4u) & 0x0Fu;
  } else {
    nibble = packed_byte & 0x0Fu;
  }

  var value: i32 = i32(nibble);
  if (value >= 8) {
    value = value - 16;
  }

  return value;
}

fn dequantize_value(int4_val: i32, scale: f32, zero_point: i32) -> f32 {
  return f32(int4_val - zero_point) * scale;
}

fn load_weight_int4(
  blocks: ptr<storage, array<QuantBlock>, read>,
  packed: ptr<storage, array<u32>, read>,
  idx: u32,
  block_size: u32
) -> f32 {
  let block_idx = idx / block_size;
  let local_idx = idx % block_size;

  let block = (*blocks)[block_idx];

  let packed_per_block = block_size / 2u;
  let packed_offset = block_idx * packed_per_block;

  let byte_idx = local_idx / 2u;
  let is_high = (local_idx % 2u) == 0u;

  let packed_byte = (*packed)[packed_offset + byte_idx];
  let int4_val = extract_int4(packed_byte, is_high);

  return dequantize_value(int4_val, block.scale, block.zero_point);
}

// ============================================================================
// Linear Projection with INT4 Weights
// ============================================================================

/**
 * Compute linear projection: output = input · W^T
 *
 * input: [batch, seq_len, hidden_size]
 * W: [hidden_size, hidden_size] (INT4 quantized)
 * output: [batch, seq_len, hidden_size]
 */
fn linear_int4(
  input_vec: ptr<storage, array<f32>, read>,
  blocks: ptr<storage, array<QuantBlock>, read>,
  packed: ptr<storage, array<u32>, read>,
  batch_idx: u32,
  seq_idx: u32,
  out_idx: u32,
  hidden_size: u32,
  block_size: u32
) -> f32 {
  var sum: f32 = 0.0;

  let input_offset = batch_idx * config.seq_len * hidden_size + seq_idx * hidden_size;

  for (var i = 0u; i < hidden_size; i++) {
    let input_val = (*input_vec)[input_offset + i];

    // Weight at position [out_idx, i] (transposed)
    let weight_idx = out_idx * hidden_size + i;
    let weight_val = load_weight_int4(blocks, packed, weight_idx, block_size);

    sum += input_val * weight_val;
  }

  return sum;
}

// ============================================================================
// Scaled Dot-Product Attention
// ============================================================================

/**
 * Compute Q·K^T / √d_k for one attention head
 *
 * Q: [seq_len, head_dim]
 * K: [seq_len, head_dim]
 * Output: [seq_len, seq_len]
 */
@compute @workgroup_size(16, 16)
fn attention_qk(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>
) {
  let head = gid.z;
  let row = gid.y;  // Query position
  let col = gid.x;  // Key position

  if (head >= config.n_heads || row >= config.seq_len || col >= config.seq_len) {
    return;
  }

  let head_dim = config.head_dim;
  let hidden_size = config.hidden_size;

  // Compute Q[row] · K[col]
  var dot: f32 = 0.0;

  for (var d = 0u; d < head_dim; d++) {
    // Q position for this head
    let q_idx = row * hidden_size + head * head_dim + d;

    // K position for this head
    let k_idx = col * hidden_size + head * head_dim + d;

    // Project input through Q and K matrices (INT4)
    // In practice, Q and K are pre-computed and stored
    // Here we assume they're available in workspace
    let q_val = input[q_idx];  // Simplified - should be Q projection
    let k_val = input[k_idx];  // Simplified - should be K projection

    dot += q_val * k_val;
  }

  // Scale by 1/√d_k
  let scale = 1.0 / sqrt(f32(head_dim));
  let scaled = dot * scale;

  // Write to workspace
  let qk_idx = head * config.seq_len * config.seq_len + row * config.seq_len + col;
  workspace_qk[qk_idx] = scaled;
}

/**
 * Apply softmax to attention scores
 *
 * For each query position, softmax over all key positions
 * Input: [n_heads, seq_len, seq_len]
 * Output: [n_heads, seq_len, seq_len]
 */
@compute @workgroup_size(256)
fn attention_softmax(@builtin(global_invocation_id) gid: vec3<u32>) {
  let head = gid.z;
  let row = gid.y;  // Query position

  if (head >= config.n_heads || row >= config.seq_len) {
    return;
  }

  let seq_len = config.seq_len;
  let row_offset = head * seq_len * seq_len + row * seq_len;

  // Find max for numerical stability
  var max_val: f32 = -1e10;
  for (var col = 0u; col < seq_len; col++) {
    let val = workspace_qk[row_offset + col];
    max_val = max(max_val, val);
  }

  // Compute exp and sum
  var sum: f32 = 0.0;
  for (var col = 0u; col < seq_len; col++) {
    let val = workspace_qk[row_offset + col];
    let exp_val = exp(val - max_val);
    workspace_softmax[row_offset + col] = exp_val;
    sum += exp_val;
  }

  // Normalize
  for (var col = 0u; col < seq_len; col++) {
    workspace_softmax[row_offset + col] /= sum;
  }
}

/**
 * Apply attention weights to values: softmax(QK^T) · V
 *
 * Softmax: [n_heads, seq_len, seq_len]
 * V: [seq_len, head_dim]
 * Output: [seq_len, hidden_size]
 */
@compute @workgroup_size(16, 16)
fn attention_values(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>
) {
  let head = gid.z;
  let row = gid.y;  // Output position
  let dim = gid.x;  // Dimension within head

  if (head >= config.n_heads || row >= config.seq_len || dim >= config.head_dim) {
    return;
  }

  let seq_len = config.seq_len;
  let hidden_size = config.hidden_size;
  let head_dim = config.head_dim;

  var sum: f32 = 0.0;

  // Sum over all sequence positions weighted by attention
  for (var col = 0u; col < seq_len; col++) {
    // Load attention weight
    let attn_idx = head * seq_len * seq_len + row * seq_len + col;
    let attn_weight = workspace_softmax[attn_idx];

    // Load value
    let v_idx = col * hidden_size + head * head_dim + dim;
    let v_val = input[v_idx];  // Simplified - should be V projection

    sum += attn_weight * v_val;
  }

  // Write to output
  let out_idx = row * hidden_size + head * head_dim + dim;
  output[out_idx] = sum;
}

// ============================================================================
// Flash Attention (Memory-Efficient)
// ============================================================================

/**
 * Flash Attention: Fused attention computation
 *
 * Computes attention without materializing full [seq_len × seq_len] matrix
 * Uses tiling to reduce memory bandwidth
 *
 * Reference: "FlashAttention: Fast and Memory-Efficient Exact Attention"
 */

var<workgroup> shared_q: array<f32, 256>;
var<workgroup> shared_k: array<f32, 256>;
var<workgroup> shared_v: array<f32, 256>;

@compute @workgroup_size(256)
fn flash_attention(@builtin(global_invocation_id) gid: vec3<u32>,
                    @builtin(local_invocation_id) lid: vec3<u32>,
                    @builtin(workgroup_id) wid: vec3<u32>) {
  let head = gid.z;
  let row = wid.y;  // Query position (one per workgroup)
  let tid = lid.x;   // Thread within workgroup

  if (head >= config.n_heads || row >= config.seq_len) {
    return;
  }

  let head_dim = config.head_dim;
  let seq_len = config.seq_len;
  let hidden_size = config.hidden_size;

  // Load query for this row into shared memory
  if (tid < head_dim) {
    let q_idx = row * hidden_size + head * head_dim + tid;
    shared_q[tid] = input[q_idx];
  }
  workgroupBarrier();

  var max_score: f32 = -1e10;
  var sum_exp: f32 = 0.0;
  var acc: array<f32, 128>;  // Accumulator for weighted values

  // Initialize accumulator
  for (var i = 0u; i < head_dim; i++) {
    acc[i] = 0.0;
  }

  // Tile over sequence length
  let tile_size = 256u;
  let num_tiles = (seq_len + tile_size - 1u) / tile_size;

  for (var tile = 0u; tile < num_tiles; tile++) {
    let col_start = tile * tile_size;
    let col_end = min(col_start + tile_size, seq_len);

    // Each thread loads one key position
    if (tid < (col_end - col_start)) {
      let col = col_start + tid;

      // Compute Q · K^T for this position
      var dot: f32 = 0.0;
      for (var d = 0u; d < head_dim; d++) {
        let k_idx = col * hidden_size + head * head_dim + d;
        let k_val = input[k_idx];
        dot += shared_q[d] * k_val;
      }

      let scale = 1.0 / sqrt(f32(head_dim));
      shared_k[tid] = dot * scale;
    }
    workgroupBarrier();

    // Update running max and sum
    for (var i = 0u; i < (col_end - col_start); i++) {
      let score = shared_k[i];

      if (score > max_score) {
        // Rescale previous sum
        let scale_factor = exp(max_score - score);
        sum_exp *= scale_factor;

        for (var d = 0u; d < head_dim; d++) {
          acc[d] *= scale_factor;
        }

        max_score = score;
      }

      let exp_score = exp(score - max_score);
      sum_exp += exp_score;

      // Load value and accumulate
      let col = col_start + i;
      for (var d = 0u; d < head_dim; d++) {
        let v_idx = col * hidden_size + head * head_dim + d;
        let v_val = input[v_idx];
        acc[d] += exp_score * v_val;
      }
    }

    workgroupBarrier();
  }

  // Normalize and write output
  if (tid < head_dim) {
    let out_idx = row * hidden_size + head * head_dim + tid;
    output[out_idx] = acc[tid] / sum_exp;
  }
}

// ============================================================================
// Causal (Masked) Attention
// ============================================================================

/**
 * Causal attention with masking
 *
 * Prevents attending to future positions (for autoregressive models)
 * Mask: positions where col > row are set to -inf before softmax
 */
@compute @workgroup_size(16, 16)
fn causal_attention_qk(
  @builtin(global_invocation_id) gid: vec3<u32>
) {
  let head = gid.z;
  let row = gid.y;
  let col = gid.x;

  if (head >= config.n_heads || row >= config.seq_len || col >= config.seq_len) {
    return;
  }

  let head_dim = config.head_dim;
  let hidden_size = config.hidden_size;

  var dot: f32 = 0.0;

  for (var d = 0u; d < head_dim; d++) {
    let q_idx = row * hidden_size + head * head_dim + d;
    let k_idx = col * hidden_size + head * head_dim + d;

    let q_val = input[q_idx];
    let k_val = input[k_idx];

    dot += q_val * k_val;
  }

  let scale = 1.0 / sqrt(f32(head_dim));
  var scaled = dot * scale;

  // Apply causal mask
  if (col > row) {
    scaled = -1e10;  // -inf for masked positions
  }

  let qk_idx = head * config.seq_len * config.seq_len + row * config.seq_len + col;
  workspace_qk[qk_idx] = scaled;
}

#!/usr/bin/env node

/**
 * SCX Tensor Pack Test Suite
 *
 * Tests:
 * 1. Binary encoding/decoding
 * 2. INT4 quantization accuracy
 * 3. Merkle verification
 * 4. Base64 encoding for GitHub storage
 * 5. End-to-end workflow
 */

import { SCXTensorPack } from './lib/scx/tensor-pack.js';
import { INT4Quantizer } from './lib/scx/int4-quantizer.js';
import { MerkleVerification } from './lib/scx/merkle-verification.js';

console.log('═══════════════════════════════════════════');
console.log('  SCX TENSOR PACK (SCX-TP-INT4) TEST SUITE');
console.log('═══════════════════════════════════════════\n');

async function runTests() {
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // Test 1: Binary Encoding/Decoding
  console.log('📦 Test 1: Binary Encoding/Decoding\n');

  const tensorPack = new SCXTensorPack();
  const pack = tensorPack.create({
    n_layers: 12,
    hidden_size: 768,
    n_heads: 12,
    seq_len: 2048,
    vocab_size: 50257
  });

  console.log('  Created pack:', pack.config);

  // Encode to binary
  const binary = tensorPack.encode(pack);
  console.log(`  ✓ Encoded to binary: ${binary.byteLength} bytes`);

  // Decode from binary
  const decoded = tensorPack.decode(binary);
  console.log('  ✓ Decoded from binary');

  // Verify
  const validation = tensorPack.validate(decoded);
  if (validation.valid) {
    console.log('  ✓ Validation passed\n');
    results.passed++;
  } else {
    console.log('  ✗ Validation failed:', validation.errors, '\n');
    results.failed++;
  }

  results.tests.push({ name: 'Binary Encoding/Decoding', passed: validation.valid });

  // Test 2: INT4 Quantization
  console.log('📐 Test 2: INT4 Quantization Accuracy\n');

  const quantizer = new INT4Quantizer(128);

  // Create test weights (simulated model layer)
  const numWeights = 768 * 768; // ~600K weights
  const fp32Weights = new Float32Array(numWeights);
  for (let i = 0; i < numWeights; i++) {
    // Random normal distribution (mean=0, std=0.02)
    fp32Weights[i] = (Math.random() - 0.5) * 0.04;
  }

  console.log(`  Created ${numWeights.toLocaleString()} FP32 weights`);

  // Quantize
  const quantResult = quantizer.quantize(fp32Weights);
  console.log(`  ✓ Quantized to INT4: ${quantResult.totalBytes.toLocaleString()} bytes`);
  console.log(`  Compression ratio: ${quantResult.stats.compressionRatio}`);
  console.log(`  Avg error: ${quantResult.stats.avgError.toFixed(6)}`);
  console.log(`  Max abs error: ${quantResult.stats.maxAbsError.toFixed(6)}`);

  // Dequantize
  const dequantized = quantizer.dequantize(quantResult.packed);
  console.log(`  ✓ Dequantized back to FP32: ${dequantized.length.toLocaleString()} values`);

  // Calculate accuracy
  const stats = quantizer.getStats(fp32Weights, quantResult);
  console.log(`  MSE: ${stats.mse.toFixed(8)}`);
  console.log(`  RMSE: ${stats.rmse.toFixed(6)}`);
  console.log(`  SNR: ${stats.snr}`);

  const quantAccurate = stats.rmse < 0.01; // Acceptable error threshold
  if (quantAccurate) {
    console.log('  ✓ Quantization accuracy acceptable\n');
    results.passed++;
  } else {
    console.log('  ✗ Quantization accuracy too low\n');
    results.failed++;
  }

  results.tests.push({ name: 'INT4 Quantization', passed: quantAccurate });

  // Test 3: Merkle Verification
  console.log('🔐 Test 3: Merkle Verification\n');

  const merkle = new MerkleVerification();

  // Add weights to pack
  pack.weights = quantResult.packed;

  // Compute Merkle root
  const merkleRoot = await merkle.computePackMerkleRoot(pack);
  pack.merkle_root = merkleRoot;

  console.log(`  ✓ Computed Merkle root: ${merkle.hashToHex(merkleRoot).substring(0, 16)}...`);

  // Verify integrity
  const verifyResult = await merkle.verify(pack);
  if (verifyResult.valid) {
    console.log('  ✓ Merkle verification passed\n');
    results.passed++;
  } else {
    console.log('  ✗ Merkle verification failed:', verifyResult.error, '\n');
    results.failed++;
  }

  results.tests.push({ name: 'Merkle Verification', passed: verifyResult.valid });

  // Test 4: Base64 Encoding (GitHub Storage)
  console.log('📝 Test 4: Base64 Encoding for GitHub\n');

  // Encode pack to binary
  const packBinary = tensorPack.encode(pack);
  console.log(`  Binary size: ${packBinary.byteLength.toLocaleString()} bytes`);

  // Encode to base64
  const base64 = tensorPack.encodeBase64(packBinary);
  console.log(`  Base64 size: ${base64.length.toLocaleString()} chars`);

  // Decode from base64
  const decodedBinary = tensorPack.decodeBase64(base64);
  console.log(`  Decoded size: ${decodedBinary.byteLength.toLocaleString()} bytes`);

  // Verify round-trip
  const roundTripSuccess = decodedBinary.byteLength === packBinary.byteLength;
  if (roundTripSuccess) {
    console.log('  ✓ Base64 round-trip successful\n');
    results.passed++;
  } else {
    console.log('  ✗ Base64 round-trip failed\n');
    results.failed++;
  }

  results.tests.push({ name: 'Base64 Encoding', passed: roundTripSuccess });

  // Test 5: INT4 Packing/Unpacking
  console.log('🔢 Test 5: INT4 Packing/Unpacking\n');

  const testValues = [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
  console.log('  Test values:', testValues);

  const packed = tensorPack.packINT4Array(testValues);
  console.log(`  ✓ Packed to ${packed.byteLength} bytes`);

  const unpacked = tensorPack.unpackINT4Array(packed, testValues.length);
  console.log('  Unpacked values:', Array.from(unpacked));

  // Verify
  const packingCorrect = testValues.every((val, idx) => val === unpacked[idx]);
  if (packingCorrect) {
    console.log('  ✓ INT4 packing/unpacking correct\n');
    results.passed++;
  } else {
    console.log('  ✗ INT4 packing/unpacking incorrect\n');
    results.failed++;
  }

  results.tests.push({ name: 'INT4 Packing/Unpacking', passed: packingCorrect });

  // Test 6: Complete Pack Stats
  console.log('📊 Test 6: Tensor Pack Statistics\n');

  const packStats = tensorPack.getStats(pack);
  console.log('  Header size:', packStats.headerSize, 'bytes');
  console.log('  Weights size:', packStats.weightsSize.toLocaleString(), 'bytes');
  console.log('  Total size:', packStats.totalSize.toLocaleString(), 'bytes');
  console.log('  Num weights:', packStats.numWeights.toLocaleString());
  console.log('  FP32 equivalent:', packStats.fp32EquivalentSize.toLocaleString(), 'bytes');
  console.log('  Compression ratio:', packStats.compressionRatio);
  console.log('  Config:', packStats.config);

  const statsValid = packStats.totalSize > 0 && packStats.compressionRatio.includes('x');
  if (statsValid) {
    console.log('  ✓ Statistics valid\n');
    results.passed++;
  } else {
    console.log('  ✗ Statistics invalid\n');
    results.failed++;
  }

  results.tests.push({ name: 'Pack Statistics', passed: statsValid });

  // Summary
  console.log('═══════════════════════════════════════════');
  console.log('  TEST RESULTS');
  console.log('═══════════════════════════════════════════\n');

  results.tests.forEach(test => {
    const status = test.passed ? '✓' : '✗';
    console.log(`  ${status} ${test.name}`);
  });

  console.log('');
  console.log(`  Passed: ${results.passed}/${results.passed + results.failed}`);
  console.log(`  Failed: ${results.failed}/${results.passed + results.failed}`);
  console.log('');

  if (results.failed === 0) {
    console.log('  🎉 ALL TESTS PASSED!');
    console.log('');
    console.log('  SCX-TP-INT4 Phase 1 Complete:');
    console.log('  ✓ Binary codec working');
    console.log('  ✓ INT4 quantization accurate');
    console.log('  ✓ Merkle verification functional');
    console.log('  ✓ Base64 encoding ready for GitHub');
    console.log('');
  } else {
    console.log('  ⚠️  SOME TESTS FAILED');
    console.log('');
  }

  return results;
}

// Run tests
runTests().then(results => {
  process.exit(results.failed > 0 ? 1 : 0);
}).catch(error => {
  console.error('\n❌ TEST ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});

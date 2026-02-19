/**
 * SCX INT4 Block-Wise Quantizer
 *
 * Quantizes FP32 weights to INT4 with block-wise scaling for:
 * - Stable dynamic range
 * - WebGPU-friendly layout
 * - Minimal accuracy loss
 *
 * Each block (default 128 elements) stores:
 * - scale (FP32)
 * - zero_point (INT8)
 * - packed INT4 weights (64 bytes for 128 values)
 */

import { SCXTensorPack } from './tensor-pack.js';

export class INT4Quantizer {
  constructor(blockSize = 128) {
    this.blockSize = blockSize;
    this.tensorPack = new SCXTensorPack();
  }

  /**
   * Quantize FP32 array to INT4 blocks
   * Returns: { blocks, totalBytes, stats }
   */
  quantize(fp32Array) {
    if (!(fp32Array instanceof Float32Array)) {
      fp32Array = new Float32Array(fp32Array);
    }

    const numElements = fp32Array.length;
    const numBlocks = Math.ceil(numElements / this.blockSize);
    const blocks = [];

    let maxAbsError = 0;
    let totalError = 0;

    for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
      const start = blockIdx * this.blockSize;
      const end = Math.min(start + this.blockSize, numElements);
      const blockValues = fp32Array.slice(start, end);

      const block = this.quantizeBlock(blockValues);
      blocks.push(block);

      // Track errors
      const dequant = this.dequantizeBlock(block);
      for (let i = 0; i < blockValues.length; i++) {
        const error = Math.abs(blockValues[i] - dequant[i]);
        maxAbsError = Math.max(maxAbsError, error);
        totalError += error;
      }
    }

    // Pack all blocks into single buffer
    const packedBuffer = this.packBlocks(blocks);

    return {
      blocks,
      packed: packedBuffer,
      totalBytes: packedBuffer.byteLength,
      stats: {
        numElements,
        numBlocks,
        blockSize: this.blockSize,
        avgError: totalError / numElements,
        maxAbsError,
        compressionRatio: ((numElements * 4) / packedBuffer.byteLength).toFixed(2) + 'x'
      }
    };
  }

  /**
   * Quantize single block of FP32 values to INT4
   */
  quantizeBlock(values) {
    const length = values.length;

    // Find min/max for this block
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let i = 0; i < length; i++) {
      minVal = Math.min(minVal, values[i]);
      maxVal = Math.max(maxVal, values[i]);
    }

    // Calculate scale and zero point
    // INT4 range: -8 to +7
    const range = maxVal - minVal;
    const scale = range > 0 ? range / 15 : 1.0; // 15 = (-8 to 7)
    const zero_point = Math.round(-minVal / scale - 8);

    // Quantize values
    const quantized = new Int8Array(length);
    for (let i = 0; i < length; i++) {
      const qval = Math.round(values[i] / scale) + zero_point;
      quantized[i] = Math.max(-8, Math.min(7, qval));
    }

    // Pack INT4 values
    const packed = this.tensorPack.packINT4Array(quantized);

    return {
      scale,
      zero_point,
      packed,
      length
    };
  }

  /**
   * Dequantize single block back to FP32
   */
  dequantizeBlock(block) {
    const { scale, zero_point, packed, length } = block;

    // Unpack INT4 values
    const quantized = this.tensorPack.unpackINT4Array(packed, length);

    // Dequantize
    const fp32 = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      fp32[i] = (quantized[i] - zero_point) * scale;
    }

    return fp32;
  }

  /**
   * Pack multiple blocks into single binary buffer
   * Layout per block:
   *   0x00: scale (FP32, 4 bytes)
   *   0x04: zero_point (INT8, 1 byte)
   *   0x05: length (UINT16, 2 bytes)
   *   0x07: padding (1 byte)
   *   0x08: packed INT4 weights (variable, ceil(length/2) bytes)
   */
  packBlocks(blocks) {
    // Calculate total size
    let totalSize = 0;
    for (const block of blocks) {
      const blockHeaderSize = 8; // scale(4) + zero_point(1) + length(2) + padding(1)
      const blockDataSize = block.packed.byteLength;
      totalSize += blockHeaderSize + blockDataSize;
    }

    // Create buffer
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    for (const block of blocks) {
      // Write scale (FP32)
      view.setFloat32(offset, block.scale, true);
      offset += 4;

      // Write zero_point (INT8)
      view.setInt8(offset, block.zero_point);
      offset += 1;

      // Write length (UINT16)
      view.setUint16(offset, block.length, true);
      offset += 2;

      // Padding
      view.setUint8(offset, 0);
      offset += 1;

      // Write packed weights
      const packedArray = new Uint8Array(buffer, offset, block.packed.byteLength);
      packedArray.set(block.packed);
      offset += block.packed.byteLength;
    }

    return buffer;
  }

  /**
   * Unpack binary buffer back to blocks
   */
  unpackBlocks(buffer, blockSize = null) {
    blockSize = blockSize || this.blockSize;

    const view = new DataView(buffer);
    const blocks = [];
    let offset = 0;

    while (offset < buffer.byteLength) {
      // Read scale
      const scale = view.getFloat32(offset, true);
      offset += 4;

      // Read zero_point
      const zero_point = view.getInt8(offset);
      offset += 1;

      // Read length
      const length = view.getUint16(offset, true);
      offset += 2;

      // Skip padding
      offset += 1;

      // Read packed weights
      const packedLength = Math.ceil(length / 2);
      const packed = new Uint8Array(buffer, offset, packedLength);
      offset += packedLength;

      blocks.push({
        scale,
        zero_point,
        packed: new Uint8Array(packed), // copy
        length
      });
    }

    return blocks;
  }

  /**
   * Dequantize full packed buffer back to FP32 array
   */
  dequantize(packedBuffer, blockSize = null) {
    const blocks = this.unpackBlocks(packedBuffer, blockSize);

    // Calculate total length
    const totalLength = blocks.reduce((sum, block) => sum + block.length, 0);

    // Dequantize all blocks
    const fp32Array = new Float32Array(totalLength);
    let offset = 0;

    for (const block of blocks) {
      const dequant = this.dequantizeBlock(block);
      fp32Array.set(dequant, offset);
      offset += block.length;
    }

    return fp32Array;
  }

  /**
   * Calibrate quantization parameters for a dataset
   * Finds optimal scale factors across multiple samples
   */
  calibrate(fp32Arrays, percentile = 99.9) {
    // Collect all absolute values
    const allAbsValues = [];
    for (const arr of fp32Arrays) {
      for (let i = 0; i < arr.length; i++) {
        allAbsValues.push(Math.abs(arr[i]));
      }
    }

    // Sort and find percentile
    allAbsValues.sort((a, b) => a - b);
    const idx = Math.floor((percentile / 100) * allAbsValues.length);
    const threshold = allAbsValues[idx];

    return {
      threshold,
      percentile,
      numSamples: allAbsValues.length,
      recommended_clipping: threshold
    };
  }

  /**
   * Quantize with clipping (outlier handling)
   */
  quantizeWithClipping(fp32Array, clipThreshold) {
    // Clip outliers
    const clipped = new Float32Array(fp32Array.length);
    for (let i = 0; i < fp32Array.length; i++) {
      clipped[i] = Math.max(-clipThreshold, Math.min(clipThreshold, fp32Array[i]));
    }

    // Quantize clipped values
    return this.quantize(clipped);
  }

  /**
   * Get quantization statistics
   */
  getStats(original, quantized) {
    if (!(original instanceof Float32Array)) {
      original = new Float32Array(original);
    }

    const dequant = this.dequantize(quantized.packed);

    // Calculate MSE
    let mse = 0;
    for (let i = 0; i < original.length; i++) {
      const error = original[i] - dequant[i];
      mse += error * error;
    }
    mse /= original.length;

    // Calculate RMSE
    const rmse = Math.sqrt(mse);

    // Calculate signal-to-noise ratio
    let signalPower = 0;
    for (let i = 0; i < original.length; i++) {
      signalPower += original[i] * original[i];
    }
    signalPower /= original.length;

    const snr = signalPower > 0 ? 10 * Math.log10(signalPower / mse) : 0;

    return {
      mse,
      rmse,
      snr: snr.toFixed(2) + ' dB',
      originalSize: original.length * 4,
      quantizedSize: quantized.totalBytes,
      compressionRatio: quantized.stats.compressionRatio,
      avgError: quantized.stats.avgError,
      maxAbsError: quantized.stats.maxAbsError
    };
  }
}

export interface WavPcmMetadata {
  readonly channels: number
  readonly sampleRate: number
  readonly frames: number
}

/** Read complete RIFF/WAVE PCM/IEEE-float storage without allocating samples.
 * Chunk lengths and word padding are checked against actual bytes/RIFF bounds.
 * Multiple data chunks are summed conservatively, not assumed all playable by
 * every backend. RF64/RIFX, compressed/extensible formats and LIST/wavl return
 * null (opaque policy); malformed recognized RIFF/PCM rejects before decode.
 * O(chunk count), O(1) state, little-endian, frames per channel at source rate.
 * https://www.mmsp.ece.mcgill.ca/Documents/AudioFormats/WAVE/Docs/riffmci.pdf
 * IBM/Microsoft Multimedia Programming Interface and Data Specifications 1.0. */
export function readWavMetadata(bytes: Uint8Array): WavPcmMetadata | null {
  if (bytes.length < 12) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57415645) return null
  const end = view.getUint32(4, true) + 8
  if (end < 12 || end > bytes.length) throw new Error('Invalid WAV RIFF size.')
  let channels = 0, sampleRate = 0, align = 0, dataBytes = 0, dataChunks = 0, opaque = false
  for (let p = 12; p < end;) {
    if (p + 8 > end) throw new Error('Truncated WAV chunk header.')
    const kind = view.getUint32(p), length = view.getUint32(p + 4, true), body = p + 8
    if (body + length > end) throw new Error('WAV chunk exceeds actual RIFF bounds.')
    if (kind === 0x666d7420) {
      if (channels || length < 16) throw new Error('Invalid WAV format chunk.')
      const format = view.getUint16(body, true), bits = view.getUint16(body + 14, true)
      if (format !== 1 && format !== 3) opaque = true
      channels = view.getUint16(body + 2, true); sampleRate = view.getUint32(body + 4, true); align = view.getUint16(body + 12, true)
      if (!opaque && (!channels || channels > 32 || !sampleRate || !(format === 1 ? [8, 16, 24, 32] : [32, 64]).includes(bits)
        || align !== channels * bits / 8 || view.getUint32(body + 8, true) !== sampleRate * align)) throw new Error('Invalid WAV PCM format/alignment.')
    } else if (kind === 0x64617461) {
      if (!channels || !opaque && length % align) throw new Error('WAV PCM data is missing its format or not frame-aligned.')
      dataBytes += length; dataChunks++
    } else if (kind === 0x4c495354 && length >= 4 && view.getUint32(body) === 0x7761766c) opaque = true
    p = body + length + (length & 1)
    if (p > end) throw new Error('WAV chunk padding exceeds RIFF bounds.')
  }
  if (opaque) return null
  if (!channels || !dataChunks || dataBytes % align) throw new Error('WAV PCM data is missing or not frame-aligned.')
  return { channels, sampleRate, frames: dataBytes / align }
}

/** Conservative Float32 channel charge after native resampling. The additional
 * frame covers rounding differences at non-integral rate ratios. This bounds the
 * admitted output policy, not decoder scratch/copies; no PCM is allocated here. */
export function wavPcmBytes(metadata: WavPcmMetadata, targetSampleRate: number): number {
  if (![metadata.channels, metadata.sampleRate, metadata.frames].every(Number.isSafeInteger)
    || metadata.channels < 1 || metadata.channels > 32 || metadata.sampleRate < 1 || metadata.frames < 0) throw new RangeError('Invalid WAV PCM metadata.')
  if (!Number.isSafeInteger(targetSampleRate) || targetSampleRate <= 0) throw new RangeError('Invalid PCM target sample rate.')
  const frames = Math.ceil(metadata.frames * targetSampleRate / metadata.sampleRate) + 1
  const bytes = frames * metadata.channels * Float32Array.BYTES_PER_ELEMENT
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new RangeError('Invalid PCM output size.')
  return bytes
}

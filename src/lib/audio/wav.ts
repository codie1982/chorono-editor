/** Portable PCM output shared by the editor download and MCP audio previews. */
export interface PCMBuffer {
  numberOfChannels: number
  length: number
  sampleRate: number
  getChannelData(channel: number): Float32Array
}

export function measurePCM(buffer: PCMBuffer) {
  let peak = 0, squareSum = 0, clippedSamples = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel)
    for (let i = 0; i < buffer.length; i++) {
      const value = Number.isFinite(samples[i]) ? samples[i] : 0
      peak = Math.max(peak, Math.abs(value)); squareSum += value * value
      if (Math.abs(value) > 1) clippedSamples++
    }
  }
  const rms = Math.sqrt(squareSum / Math.max(1, buffer.length * buffer.numberOfChannels))
  // JSON uses null for silence; no Infinity/NaN crosses the MCP boundary.
  return { peak, peakDbFS: peak ? 20 * Math.log10(peak) : null, rms,
    rmsDbFS: rms ? 20 * Math.log10(rms) : null, clippedSamples }
}

export function encodeWav(buffer: PCMBuffer): Uint8Array {
  if (![1, 2].includes(buffer.numberOfChannels) || !Number.isInteger(buffer.length) || buffer.length < 1
    || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate < 8000 || buffer.sampleRate > 96000) throw new Error('Invalid PCM output')
  const dataSize = buffer.length * buffer.numberOfChannels * 2
  if (dataSize > 24 * 1024 * 1024) throw new Error('WAV output exceeds 24 MB; shorten the range')
  const bytes = new Uint8Array(44 + dataSize), view = new DataView(bytes.buffer)
  const label = (at: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)) }
  label(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); label(8, 'WAVE'); label(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, buffer.numberOfChannels, true)
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true)
  view.setUint16(32, buffer.numberOfChannels * 2, true); view.setUint16(34, 16, true)
  label(36, 'data'); view.setUint32(40, dataSize, true)
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  let offset = 44
  for (let i = 0; i < buffer.length; i++) for (const channel of channels) {
    const sample = Math.max(-1, Math.min(1, Number.isFinite(channel[i]) ? channel[i] : 0))
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2
  }
  return bytes
}

/** Peak of the referenced source range, before clip gain/fades. */
export function sourceRangePeak(buffer: PCMBuffer, offsetMs: number, durationMs: number, loop = false): number {
  const length = buffer.length, rate = buffer.sampleRate
  if (!length || durationMs <= 0) return 0
  const first = Math.max(0, Math.floor(offsetMs * rate / 1000))
  const count = Math.max(0, Math.ceil(durationMs * rate / 1000))
  let peak = 0
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    const samples = loop ? Math.min(length, count) : Math.max(0, Math.min(length - first, count))
    for (let i = 0; i < samples; i++) peak = Math.max(peak, Math.abs(data[loop ? (first + i) % length : first + i]))
  }
  return peak
}

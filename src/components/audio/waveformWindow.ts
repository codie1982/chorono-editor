import type { WaveformPeaks } from '@/lib/timeline/audioWaveform'
export const MAX_WAVEFORM_BUCKETS = 131072
export function waveformPixelSourceRange(sourceOffsetMs: number, clipStartMs: number, clipDurationMs: number,
  visibleStartMs: number, pixelsPerMs: number, x: number): [number, number] {
  const offset = visibleStartMs - clipStartMs
  return [sourceOffsetMs + offset + x / pixelsPerMs,
    sourceOffsetMs + Math.min(clipDurationMs, offset + (x + 1) / pixelsPerMs)]
}
export function waveformBucketCount(durationMs: number, pixelsPerMs: number): number {
  return Math.max(256, Math.min(MAX_WAVEFORM_BUCKETS, 2 ** Math.ceil(Math.log2(Math.max(1, durationMs * pixelsPerMs)))))
}
/** A pixel may cross the source loop boundary, or cover many whole loops. */
export function sourceWaveformRanges(fromMs: number, toMs: number, durationMs: number, loop: boolean): Array<[number, number]> {
  if (!(durationMs > 0) || toMs <= fromMs) return []
  if (!loop) {
    const from = Math.max(0, fromMs), to = Math.min(durationMs, toMs)
    return to > from ? [[from, to]] : []
  }
  const length = toMs - fromMs
  if (length >= durationMs) return [[0, durationMs]]
  const from = ((fromMs % durationMs) + durationMs) % durationMs
  const end = from + length
  return end <= durationMs ? [[from, end]] : [[from, durationMs], [0, end - durationMs]]
}
export function waveformExtrema(peaks: WaveformPeaks, fromMs: number, toMs: number, loop: boolean,
  channel = 0, detail?: AudioBuffer): [number, number] {
  const extended = peaks as WaveformPeaks & { channelPeaks?: Float32Array[] }
  const data = extended.channelPeaks?.[channel] ?? peaks.peaks
  let min = Infinity, max = -Infinity
  for (const [from, to] of sourceWaveformRanges(fromMs, toMs, peaks.durationSec * 1000, loop)) {
    if (detail) {
      const samples = detail.getChannelData(Math.min(channel, detail.numberOfChannels - 1))
      const first = Math.max(0, Math.floor(from * detail.sampleRate / 1000))
      const end = Math.min(samples.length, Math.max(first + 1, Math.ceil(to * detail.sampleRate / 1000)))
      for (let i = first; i < end; i++) { min = Math.min(min, samples[i]); max = Math.max(max, samples[i]) }
    } else {
      const first = Math.max(0, Math.floor(from / (peaks.durationSec * 1000) * peaks.bucketCount))
      const end = Math.min(peaks.bucketCount, Math.max(first + 1, Math.ceil(to / (peaks.durationSec * 1000) * peaks.bucketCount)))
      for (let i = first; i < end; i++) { min = Math.min(min, data[i * 2]); max = Math.max(max, data[i * 2 + 1]) }
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : [0, 0]
}

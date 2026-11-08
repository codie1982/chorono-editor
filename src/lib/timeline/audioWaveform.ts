import { acquireAudioBufferFromUrl } from '../audio/AudioAssetService'
import { cancelledJobError } from '../resources/jobs'

export interface WaveformPeaks {
  bucketCount: number
  /** Union of channel extrema; opposing stereo channels never cancel. */
  peaks: Float32Array
  channelPeaks: Float32Array[]
  channelCount: number
  durationSec: number
}
const DEFAULT_BUCKETS = 400
const cache = new Map<string, WaveformPeaks>()
const normalizeBuckets = (count: number) => Math.max(1, Math.min(131072, Math.floor(Number.isFinite(count) ? count : DEFAULT_BUCKETS)))
const keyFor = (url: string, count: number) => JSON.stringify([url, normalizeBuckets(count)])

/** Every sample belongs to a bucket, including the source's final remainder.
 * Empty buckets are zero (short clips at high zoom), never inverted extrema. */
export function downsampleAudioBuffer(audio: AudioBuffer, requestedBuckets: number): WaveformPeaks {
  const bucketCount = normalizeBuckets(requestedBuckets)
  const channelPeaks: Float32Array[] = []
  const peaks = new Float32Array(bucketCount * 2)
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c), output = new Float32Array(bucketCount * 2)
    for (let b = 0; b < bucketCount; b++) {
      const start = Math.floor(b * audio.length / bucketCount)
      const end = Math.floor((b + 1) * audio.length / bucketCount)
      let min = Infinity, max = -Infinity
      for (let i = start; i < end; i++) { min = Math.min(min, data[i]); max = Math.max(max, data[i]) }
      output[b * 2] = min === Infinity ? 0 : min
      output[b * 2 + 1] = max === -Infinity ? 0 : max
      if (c === 0) { peaks[b * 2] = output[b * 2]; peaks[b * 2 + 1] = output[b * 2 + 1] }
      else { peaks[b * 2] = Math.min(peaks[b * 2], output[b * 2]); peaks[b * 2 + 1] = Math.max(peaks[b * 2 + 1], output[b * 2 + 1]) }
    }
    channelPeaks.push(output)
  }
  return { bucketCount, peaks, channelPeaks, channelCount: audio.numberOfChannels, durationSec: audio.duration }
}

/** Per-view cancellation shares URL decoding in AudioAssetService. Peak
 * calculation is synchronous; a cache recheck deduplicates identical reductions
 * after shared decoding without coupling different views' abort lifetimes. */
export async function loadWaveformPeaks(url: string, bucketCount = DEFAULT_BUCKETS,
  options: { signal?: AbortSignal } = {}): Promise<WaveformPeaks> {
  if (options.signal?.aborted) throw cancelledJobError()
  const key = keyFor(url, bucketCount), cached = cache.get(key)
  if (cached) { cache.delete(key); cache.set(key, cached); return cached }
  const lease = await acquireAudioBufferFromUrl(url, options)
  try {
    if (options.signal?.aborted) throw cancelledJobError()
    const shared = cache.get(key)
    if (shared) return shared
    const peaks = downsampleAudioBuffer(lease.buffer, bucketCount)
    cache.set(key, peaks)
    // Peak arrays are small but zoom histories must not grow without bound.
    while (cache.size > 24) cache.delete(cache.keys().next().value!)
    return peaks
  } finally { lease.release() }
}
export function peekCachedPeaks(url: string, bucketCount = DEFAULT_BUCKETS): WaveformPeaks | null {
  return cache.get(keyFor(url, bucketCount)) ?? null
}

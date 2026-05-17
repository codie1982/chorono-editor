// ── Audio waveform peak extraction (BL-37) ─────────────────────────────────
// Pulls an audio URL through Web Audio API's decodeAudioData and reduces it
// to a fixed-size array of (min, max) peaks for waveform rendering. The
// reduction is independent of the asset's sample rate so the waveform
// drawn at the same width always uses the same number of buckets, which
// keeps the canvas paint cheap.

export interface WaveformPeaks {
  /** Number of buckets (== peaks.length / 2). */
  bucketCount: number
  /** Flattened [min0, max0, min1, max1, …] in [-1, 1]. */
  peaks:       Float32Array
  /** Original sample length / sampleRate (seconds). */
  durationSec: number
}

const DEFAULT_BUCKETS = 400

// Module-level cache shared across all consumers. Key by URL + bucketCount
// so different sizes don't collide. AudioBuffer itself is large and held
// only briefly during downsample, then dropped.
const cache = new Map<string, WaveformPeaks>()
const inflight = new Map<string, Promise<WaveformPeaks>>()

let sharedCtx: AudioContext | null = null
function getCtx(): AudioContext {
  if (!sharedCtx) {
    const Ctor = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    sharedCtx = new Ctor()
  }
  return sharedCtx
}

/** Decode the asset URL and downsample to (min, max) peaks. Cached per URL. */
export async function loadWaveformPeaks(
  url: string,
  bucketCount = DEFAULT_BUCKETS,
): Promise<WaveformPeaks> {
  const key = `${url}#${bucketCount}`
  const cached = cache.get(key)
  if (cached) return cached
  const pending = inflight.get(key)
  if (pending) return pending

  const p = (async () => {
    const res = await fetch(url)
    const buf = await res.arrayBuffer()
    const audio = await getCtx().decodeAudioData(buf)
    const peaks = downsample(audio, bucketCount)
    const out: WaveformPeaks = {
      bucketCount,
      peaks,
      durationSec: audio.duration,
    }
    cache.set(key, out)
    inflight.delete(key)
    return out
  })()
  inflight.set(key, p)
  return p
}

/** Convert a decoded AudioBuffer to [min0, max0, min1, max1, …]. Mixes
 *  channels to mono by averaging — keeps the peak math simple and reflects
 *  what the user will hear in stereo playback. */
function downsample(buf: AudioBuffer, bucketCount: number): Float32Array {
  const length = buf.length
  const channels = buf.numberOfChannels
  const blockSize = Math.max(1, Math.floor(length / bucketCount))
  const out = new Float32Array(bucketCount * 2)

  // Pull channel data once (avoid per-sample function-call overhead).
  const chData: Float32Array[] = []
  for (let c = 0; c < channels; c++) chData.push(buf.getChannelData(c))

  for (let b = 0; b < bucketCount; b++) {
    const start = b * blockSize
    const end   = Math.min(length, start + blockSize)
    let min = 1, max = -1
    for (let i = start; i < end; i++) {
      let sum = 0
      for (let c = 0; c < channels; c++) sum += chData[c][i]
      const s = sum / channels
      if (s < min) min = s
      if (s > max) max = s
    }
    out[b * 2]     = min
    out[b * 2 + 1] = max
  }
  return out
}

/** Synchronous cache peek — useful when the component re-renders frequently
 *  and we don't want to kick off a re-fetch each time. */
export function peekCachedPeaks(url: string, bucketCount = DEFAULT_BUCKETS): WaveformPeaks | null {
  return cache.get(`${url}#${bucketCount}`) ?? null
}

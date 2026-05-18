/** Procedural controller samplers (BL-50). Pure functions: (params, t) → value. */

import { signedNoise1D, fbm1D } from '../noise/noise'
import type {
  WaveformControllerParams, NoiseControllerParams, TrackController,
} from './types'

/** Sample a waveform controller at absolute time `timeSec` (seconds). */
export function sampleWaveform(p: WaveformControllerParams, timeSec: number): number {
  const u = timeSec * p.frequency + p.phase / (2 * Math.PI)
  const t = ((u % 1) + 1) % 1
  let v: number
  switch (p.shape) {
    case 'cosine':           v = Math.cos(2 * Math.PI * u); break
    case 'square':           v = t < p.duty ? 1 : -1;       break
    case 'triangle':         v = 1 - 4 * Math.abs(t - 0.5); break
    case 'sawtooth':         v = t * 2 - 1;                 break
    case 'reverseSawtooth':  v = 1 - t * 2;                 break
    case 'sine':
    default:                 v = Math.sin(2 * Math.PI * u)
  }
  return v * p.amplitude + p.offset
}

/** Sample a noise controller at absolute time `timeSec` (seconds). */
export function sampleNoise(p: NoiseControllerParams, timeSec: number): number {
  const x = timeSec * p.frequency
  let n = p.octaves > 1
    ? fbm1D(x, p.seed, p.octaves, p.lacunarity, p.gain)
    : signedNoise1D(x, p.seed)
  if (p.positiveOnly) n = (n + 1) * 0.5
  return n * p.strength + p.offset
}

/** Top-level dispatcher. `timeMs` is expected to be POST-out-of-range,
 *  so cycle / loop behaviors work naturally around procedural cycles. */
export function sampleController(c: TrackController, timeMs: number): number {
  const timeSec = timeMs / 1000
  switch (c.type) {
    case 'waveform': return sampleWaveform(c.waveform, timeSec)
    case 'noise':    return sampleNoise(c.noise, timeSec)
    case 'keyframe':
    default:         return 0  // caller should use keyframe path; defensive zero.
  }
}

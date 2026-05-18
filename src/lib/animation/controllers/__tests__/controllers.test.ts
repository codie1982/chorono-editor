import { describe, it, expect } from 'vitest'
import { evaluateTrack } from '../../../evaluator'
import type { Track } from '../../../types'
import {
  sampleWaveform, sampleNoise, sampleController,
  DEFAULT_WAVEFORM_PARAMS, DEFAULT_NOISE_PARAMS,
} from '../../../types'

describe('BL-50 procedural controllers', () => {
  describe('sampleWaveform', () => {
    it('sine at t=0 with phase=0 = offset', () => {
      const v = sampleWaveform({ ...DEFAULT_WAVEFORM_PARAMS, shape: 'sine', amplitude: 1, frequency: 1, offset: 5 }, 0)
      expect(v).toBeCloseTo(5, 5)
    })
    it('square wave: above duty → -1*amp, below → +1*amp', () => {
      const p = { ...DEFAULT_WAVEFORM_PARAMS, shape: 'square' as const, amplitude: 10, frequency: 1, duty: 0.5, offset: 0 }
      expect(sampleWaveform(p, 0.25)).toBe(10)  // first half: high
      expect(sampleWaveform(p, 0.75)).toBe(-10) // second half: low
    })
    it('triangle peaks at t=0.5 (+amp), troughs at t=0 (-amp)', () => {
      // 1 - 4*|t-0.5|  → 1 at t=0.5, -1 at t=0/1
      const p = { ...DEFAULT_WAVEFORM_PARAMS, shape: 'triangle' as const, amplitude: 10, frequency: 1, offset: 0 }
      expect(sampleWaveform(p, 0.5)).toBeCloseTo(10, 5)
      expect(sampleWaveform(p, 0)).toBeCloseTo(-10, 5)
    })
    it('sawtooth ramps -amp → +amp linearly within a cycle', () => {
      const p = { ...DEFAULT_WAVEFORM_PARAMS, shape: 'sawtooth' as const, amplitude: 10, frequency: 1, offset: 0 }
      expect(sampleWaveform(p, 0)).toBeCloseTo(-10, 5)
      expect(sampleWaveform(p, 0.5)).toBeCloseTo(0, 5)
    })
  })

  describe('sampleNoise', () => {
    it('deterministic — same input → same output', () => {
      const p = { ...DEFAULT_NOISE_PARAMS }
      expect(sampleNoise(p, 1.5)).toBe(sampleNoise(p, 1.5))
    })
    it('positiveOnly stays >= offset (no negative excursions)', () => {
      const p = { ...DEFAULT_NOISE_PARAMS, positiveOnly: true, offset: 5, strength: 10 }
      for (let i = 0; i < 50; i++) {
        const v = sampleNoise(p, i * 0.1)
        expect(v).toBeGreaterThanOrEqual(5)
      }
    })
    it('octaves>1 uses fbm path (different output)', () => {
      const single = sampleNoise({ ...DEFAULT_NOISE_PARAMS, octaves: 1 }, 3.7)
      const fbm    = sampleNoise({ ...DEFAULT_NOISE_PARAMS, octaves: 4 }, 3.7)
      expect(single).not.toBe(fbm)
    })
  })

  describe('evaluateTrack with controller', () => {
    function procTrack(kind: 'waveform' | 'noise'): Track {
      return {
        target: 'layers.x.opacity',
        keyframes: [], // Ignored when controller is set!
        controller: kind === 'waveform'
          ? { type: 'waveform', waveform: { ...DEFAULT_WAVEFORM_PARAMS, shape: 'sine', amplitude: 1, frequency: 1, offset: 10 } }
          : { type: 'noise',    noise:    { ...DEFAULT_NOISE_PARAMS, seed: 0, frequency: 2, strength: 5, octaves: 1 } },
      }
    }

    it('waveform controller ignores empty keyframes (no null return)', () => {
      const v = evaluateTrack(procTrack('waveform'), 0)
      expect(v).not.toBeNull()
      // sin(0)=0 → value = 0*amp + offset = 10
      expect(v).toBeCloseTo(10, 5)
    })

    it('noise controller produces values around 0+offset', () => {
      const t = procTrack('noise')
      const samples = Array.from({ length: 20 }, (_, i) => evaluateTrack(t, i * 100) as number)
      expect(samples.every((v) => Number.isFinite(v))).toBe(true)
    })

    it('controller=keyframe falls through to keyframe path', () => {
      const t: Track = {
        target: 'layers.x.opacity',
        keyframes: [
          { id: 'k1', timeMs: 0,    value: 0,   easing: { type: 'linear' } },
          { id: 'k2', timeMs: 1000, value: 100, easing: { type: 'linear' } },
        ],
        controller: { type: 'keyframe' },
      }
      expect(evaluateTrack(t, 500)).toBeCloseTo(50, 5)
    })

    it('sampleController dispatch returns 0 for keyframe (defensive)', () => {
      expect(sampleController({ type: 'keyframe' }, 1000)).toBe(0)
    })
  })
})

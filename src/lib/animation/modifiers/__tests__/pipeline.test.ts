import { describe, it, expect } from 'vitest'
import { evaluateTrack } from '../../../evaluator'
import type { Track, CurveModifier } from '../../../types'
import { defaultParametersFor } from '../builtins'
import { blendModifierValue, applyModifiers, hashTrackSeed } from '../pipeline'

/** Helper: minimal 0→100 over 0→1000ms track with optional segment + track mods. */
function makeTrack(opts: {
  segmentModifiers?: CurveModifier[]
  trackModifiers?:   CurveModifier[]
} = {}): Track {
  return {
    target: 'layers.x.opacity',
    keyframes: [
      {
        id: 'k1', timeMs: 0, value: 0, easing: { type: 'linear' },
        segmentModifiers: opts.segmentModifiers,
      },
      {
        id: 'k2', timeMs: 1000, value: 100, easing: { type: 'linear' },
      },
    ],
    modifiers: opts.trackModifiers,
  }
}

function mod(type: CurveModifier['type'], params: CurveModifier['parameters'] = {}, overrides: Partial<CurveModifier> = {}): CurveModifier {
  return {
    id:        `m_${type}`,
    type,
    enabled:   true,
    blendMode: 'add',
    weight:    1,
    parameters: { ...defaultParametersFor(type), ...params },
    ...overrides,
  }
}

describe('BL-46 modifier pipeline', () => {
  describe('blendModifierValue', () => {
    it('add: current + mod*weight', () => {
      expect(blendModifierValue(10, 5, 'add', 1)).toBe(15)
      expect(blendModifierValue(10, 5, 'add', 0.5)).toBe(12.5)
    })
    it('multiply: current * (1 + (mod-1)*weight)', () => {
      // mod=2, weight=1 → current * 2
      expect(blendModifierValue(10, 2, 'multiply', 1)).toBe(20)
      // weight=0 → identity
      expect(blendModifierValue(10, 2, 'multiply', 0)).toBe(10)
    })
    it('replace: linear interp between current and mod', () => {
      expect(blendModifierValue(0, 100, 'replace', 0)).toBe(0)
      expect(blendModifierValue(0, 100, 'replace', 1)).toBe(100)
      expect(blendModifierValue(0, 100, 'replace', 0.5)).toBe(50)
    })
    it('blend: current + (mod - current)*weight (same as replace)', () => {
      expect(blendModifierValue(20, 80, 'blend', 0.5)).toBe(50)
    })
  })

  describe('applyModifiers chain', () => {
    it('returns base value when no modifiers', () => {
      expect(applyModifiers(undefined, 42, baseCtx())).toBe(42)
      expect(applyModifiers([], 42, baseCtx())).toBe(42)
    })
    it('skips disabled modifiers', () => {
      const disabled = mod('offset', { delta: 100 }, { enabled: false })
      expect(applyModifiers([disabled], 5, baseCtx())).toBe(5)
    })
    it('runs in order (offset then scale)', () => {
      // 5 + 10 = 15, then 15 * 2 = 30
      const offset = mod('offset', { delta: 10 }, { blendMode: 'replace' })
      const scale  = mod('scale',  { factor: 2 }, { blendMode: 'replace' })
      expect(applyModifiers([offset, scale], 5, baseCtx())).toBe(30)
    })
  })

  describe('evaluateTrack integration', () => {
    it('passes through base interpolation when no modifiers', () => {
      const track = makeTrack()
      expect(evaluateTrack(track, 500)).toBeCloseTo(50, 5)
    })
    it('applies track-scope clamp (caps a noisy upstream)', () => {
      const track = makeTrack({
        trackModifiers: [mod('clamp', { min: 0, max: 40 }, { blendMode: 'replace' })],
      })
      // Base would be 50 at midpoint; clamp caps at 40
      expect(evaluateTrack(track, 500)).toBe(40)
    })
    it('applies segment-scope offset before track-scope clamp', () => {
      const track = makeTrack({
        segmentModifiers: [mod('offset', { delta: 30 }, { blendMode: 'replace' })],
        trackModifiers:   [mod('clamp',  { min: 0, max: 70 }, { blendMode: 'replace' })],
      })
      // 0 + 30 = 30 (from segment offset replace) — wait, replace with weight 1 = exactly the mod value
      // The offset modifier reads currentValue + delta then blend replaces with that result.
      // base = 50, offset mod = 50 + 30 = 80, replace weight 1 → 80; clamp caps at 70 → 70
      expect(evaluateTrack(track, 500)).toBe(70)
    })
    it('sine modifier adds oscillation around the base', () => {
      const track = makeTrack({
        trackModifiers: [mod('sine', { amplitude: 10, frequency: 1 })],
      })
      // localT=0 → sin(0)*10 = 0, so add 0 → 0 + 50 = 50
      expect(evaluateTrack(track, 500)).toBeCloseTo(50 + Math.sin(2 * Math.PI * 0.5) * 10, 5)
    })
  })

  describe('hashTrackSeed', () => {
    it('is deterministic', () => {
      expect(hashTrackSeed('layers.x.opacity')).toBe(hashTrackSeed('layers.x.opacity'))
    })
    it('differs per input', () => {
      expect(hashTrackSeed('layers.x.opacity')).not.toBe(hashTrackSeed('layers.y.opacity'))
    })
  })
})

function baseCtx() {
  return {
    timeMs: 0, localT: 0, segmentStartMs: 0, segmentEndMs: 1000,
    durationMs: 1000, seed: 0,
  }
}

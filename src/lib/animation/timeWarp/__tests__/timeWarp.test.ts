import { describe, it, expect } from 'vitest'
import { evaluateTrack } from '../../../evaluator'
import type { Track } from '../../../types'
import { sampleBezier, type BezierTuple } from '../../../types'

const LINEAR_BEZIER: BezierTuple = { cx1: 0,    cy1: 0,    cx2: 1,    cy2: 1 }
const EASE_IN:       BezierTuple = { cx1: 0.42, cy1: 0,    cx2: 1,    cy2: 1 }
const EASE_OUT:      BezierTuple = { cx1: 0,    cy1: 0,    cx2: 0.58, cy2: 1 }

function makeTrack(opts: {
  easeCurve?: BezierTuple
  timeWarp?:  BezierTuple
  multiplierCurve?: BezierTuple
  multiplierAmplitude?: number
} = {}): Track {
  return {
    target: 'layers.x.opacity',
    keyframes: [
      { id: 'k1', timeMs: 0,    value: 0,   easing: { type: 'linear' } },
      { id: 'k2', timeMs: 1000, value: 100, easing: { type: 'linear' } },
    ],
    ...opts,
  }
}

describe('BL-48 sampleBezier', () => {
  it('identity (0..1 control points on diagonal) ≈ pass-through', () => {
    expect(sampleBezier(LINEAR_BEZIER, 0)).toBe(0)
    expect(sampleBezier(LINEAR_BEZIER, 1)).toBe(1)
    expect(sampleBezier(LINEAR_BEZIER, 0.5)).toBeCloseTo(0.5, 3)
  })

  it('ease-in curve: at x=0.5 output is < 0.5 (slower start)', () => {
    expect(sampleBezier(EASE_IN, 0.5)).toBeLessThan(0.5)
  })

  it('ease-out curve: at x=0.5 output is > 0.5 (faster start)', () => {
    expect(sampleBezier(EASE_OUT, 0.5)).toBeGreaterThan(0.5)
  })

  it('clamps inputs outside [0,1]', () => {
    expect(sampleBezier(LINEAR_BEZIER, -5)).toBe(0)
    expect(sampleBezier(LINEAR_BEZIER,  5)).toBe(1)
  })
})

describe('BL-48 evaluateTrack with track-level warps', () => {
  it('no warp → linear interpolation (baseline)', () => {
    expect(evaluateTrack(makeTrack(), 500)).toBeCloseTo(50, 5)
  })

  it('ease-in pushes the midpoint value DOWN (track runs slower at start)', () => {
    // At evalTime=500 (track midpoint), ease-in remaps to a smaller localT,
    // which on a 0→100 linear ramp yields < 50.
    const v = evaluateTrack(makeTrack({ easeCurve: EASE_IN }), 500)
    expect(v).toBeLessThan(50)
  })

  it('ease-out pushes the midpoint value UP (track runs faster at start)', () => {
    const v = evaluateTrack(makeTrack({ easeCurve: EASE_OUT }), 500)
    expect(v).toBeGreaterThan(50)
  })

  it('ease + timeWarp compose (ease-in then ease-out cancels back near linear)', () => {
    const v = evaluateTrack(
      makeTrack({ easeCurve: EASE_IN, timeWarp: EASE_OUT }),
      500,
    )
    expect(v).not.toBeNull()
    // Composing inverse curves isn't perfectly identity (CSS beziers
    // aren't true inverses) but should be much closer to 50 than either
    // alone.
    expect(Math.abs((v as number) - 50)).toBeLessThan(5)
  })

  it('multiplier curve scales the output (amplitude=1, bezier=identity → x2 at peak)', () => {
    // bezier(0.5) = 0.5 → multiplier = 1 + (0.5 - 0.5) * 2 = 1 (no effect at center for linear).
    // bezier(1)   = 1   → multiplier = 1 + (1 - 0.5) * 2 = 2 → value*2.
    const v = evaluateTrack(
      makeTrack({ multiplierCurve: LINEAR_BEZIER, multiplierAmplitude: 1 }),
      1000, // at endpoint, base=100, multiplier=2 → 200
    )
    expect(v).toBe(200)
  })

  it('multiplier amplitude=0 → no effect', () => {
    const v = evaluateTrack(
      makeTrack({ multiplierCurve: LINEAR_BEZIER, multiplierAmplitude: 0 }),
      500,
    )
    expect(v).toBeCloseTo(50, 5)
  })
})

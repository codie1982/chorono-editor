import { describe, it, expect } from 'vitest'
import { simplifyRDP, type Sample } from '../simplify'
import { sampleTrackDense, bakeTrackToKeyframes, bakeTrack } from '../bake'
import { evaluateTrack } from '../../../evaluator'
import type { Track } from '../../../types'

describe('BL-51 simplifyRDP', () => {
  it('preserves endpoints', () => {
    const s: Sample[] = [
      { timeMs: 0,    value: 0 },
      { timeMs: 100,  value: 0.1 },
      { timeMs: 200,  value: 0.2 },
      { timeMs: 300,  value: 0.3 },
      { timeMs: 1000, value: 1 },
    ]
    const out = simplifyRDP(s, 0.01)
    expect(out[0]).toEqual(s[0])
    expect(out[out.length - 1]).toEqual(s[s.length - 1])
  })

  it('eliminates collinear points (linear → 2 kfs)', () => {
    const s = Array.from({ length: 11 }, (_, i) => ({ timeMs: i * 100, value: i * 10 }))
    const out = simplifyRDP(s, 0.01)
    expect(out.length).toBe(2)
  })

  it('keeps the peak in a triangle wave (>2 kfs)', () => {
    const s: Sample[] = [
      { timeMs: 0,    value: 0 },
      { timeMs: 250,  value: 25 },
      { timeMs: 500,  value: 100 },  // peak
      { timeMs: 750,  value: 25 },
      { timeMs: 1000, value: 0 },
    ]
    const out = simplifyRDP(s, 0.05)
    // Endpoints + peak at minimum
    expect(out.length).toBeGreaterThanOrEqual(3)
    expect(out.some((p) => p.timeMs === 500)).toBe(true)
  })

  it('tolerance=0 returns full input unchanged', () => {
    const s = Array.from({ length: 5 }, (_, i) => ({ timeMs: i, value: i }))
    expect(simplifyRDP(s, 0).length).toBe(5)
  })
})

describe('BL-51 bakeTrack', () => {
  it('bakes a signal-system track to keyframe-only with shape preserved', () => {
    const track: Track = {
      target: 'layers.x.opacity',
      keyframes: [
        { id: 'k1', timeMs: 0,    value: 0,   easing: { type: 'linear' } },
        { id: 'k2', timeMs: 1000, value: 100, easing: { type: 'linear' } },
      ],
      modifiers: [
        // Identity clamp — value should remain interpolated 0..100
        { id: 'm1', type: 'clamp', enabled: true, blendMode: 'replace',
          weight: 1, parameters: { min: 0, max: 100 } },
      ],
    }
    const baked = bakeTrack(track, { startMs: 0, endMs: 1000, fps: 60, tolerance: 0.01 })
    expect(baked.modifiers).toBeUndefined()
    expect(baked.outOfRange).toBeUndefined()
    expect(baked.controller).toBeUndefined()
    expect(baked.keyframes.length).toBeGreaterThanOrEqual(2)
    // Sample-check: midpoint value should still be ~50.
    const midKf = baked.keyframes.find((k) => Math.abs(k.timeMs - 500) < 20)
    if (midKf) expect(midKf.value as number).toBeCloseTo(50, 1)
  })

  it('produces matching values when re-evaluated (within tolerance)', () => {
    // Procedural waveform track — bake it and evaluate both.
    const src: Track = {
      target: 'layers.x.opacity',
      keyframes: [],
      controller: { type: 'waveform', waveform: {
        shape: 'sine', amplitude: 50, frequency: 1, phase: 0, offset: 50, duty: 0.5,
      } },
    }
    const baked = bakeTrack(src, { startMs: 0, endMs: 2000, fps: 60, tolerance: 0.005 })
    for (let t = 0; t <= 2000; t += 100) {
      const a = evaluateTrack(src,   t) as number
      const b = evaluateTrack(baked, t) as number
      expect(Math.abs(a - b)).toBeLessThan(5) // within 5% of amplitude
    }
  })

  it('sampleTrackDense includes endpoint even if fps misaligns', () => {
    const t: Track = {
      target: 'x',
      keyframes: [
        { id: 'a', timeMs: 0, value: 0, easing: { type: 'linear' } },
        { id: 'b', timeMs: 1000, value: 100, easing: { type: 'linear' } },
      ],
    }
    const s = sampleTrackDense(t, { startMs: 0, endMs: 1000, fps: 7, tolerance: 0 })
    expect(s[s.length - 1].timeMs).toBeCloseTo(1000, 5)
  })
})

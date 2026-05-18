import { describe, it, expect } from 'vitest'
import { evaluateTrack } from '../../../evaluator'
import type { Track } from '../../../types'

/** Build a minimal property Track with two keyframes 0→100 over 0→1000ms. */
function makeRampTrack(outOfRange?: Track['outOfRange']): Track {
  return {
    target: 'layers.x.opacity',
    keyframes: [
      { id: 'k1', timeMs: 0,    value: 0,   easing: { type: 'linear' } },
      { id: 'k2', timeMs: 1000, value: 100, easing: { type: 'linear' } },
    ],
    outOfRange,
  }
}

describe('evaluateTrack with out-of-range (BL-45)', () => {
  describe('backwards compatibility', () => {
    it('undefined outOfRange → constant before/after (existing behavior)', () => {
      const track = makeRampTrack()
      expect(evaluateTrack(track, -500)).toBe(0)
      expect(evaluateTrack(track, 500)).toBeCloseTo(50, 5)
      expect(evaluateTrack(track, 1500)).toBe(100)
    })

    it('returns null for empty track', () => {
      const track: Track = { target: 'x', keyframes: [] }
      expect(evaluateTrack(track, 500)).toBeNull()
    })
  })

  describe('cycle mode', () => {
    it('repeats values after range', () => {
      const track = makeRampTrack({ before: 'constant', after: 'cycle' })
      // 1500ms = 500ms into the next cycle
      expect(evaluateTrack(track, 1500)).toBeCloseTo(50, 5)
      // 2750ms = 750ms into 3rd cycle
      expect(evaluateTrack(track, 2750)).toBeCloseTo(75, 5)
    })

    it('repeats values before range', () => {
      const track = makeRampTrack({ before: 'cycle', after: 'constant' })
      // -250ms wraps to 750ms
      expect(evaluateTrack(track, -250)).toBeCloseTo(75, 5)
    })
  })

  describe('pingPong mode', () => {
    it('bounces back after range', () => {
      const track = makeRampTrack({ before: 'constant', after: 'pingPong' })
      // 1250ms = bounces back, position 750ms → value 75
      expect(evaluateTrack(track, 1250)).toBeCloseTo(75, 5)
      // 1750ms = bounces back further, position 250ms → value 25
      expect(evaluateTrack(track, 1750)).toBeCloseTo(25, 5)
    })
  })

  describe('relativeRepeat mode', () => {
    it('adds value delta per cycle after range', () => {
      const track = makeRampTrack({ before: 'constant', after: 'relativeRepeat' })
      // Cycle 1: 1500ms → wraps to 500ms (value 50) + delta 100 = 150
      expect(evaluateTrack(track, 1500)).toBeCloseTo(150, 5)
      // Cycle 2: 2500ms → wraps to 500ms (value 50) + 2 * delta 100 = 250
      expect(evaluateTrack(track, 2500)).toBeCloseTo(250, 5)
    })
  })

  describe('constant mode (explicit)', () => {
    it('clamps to range endpoints', () => {
      const track = makeRampTrack({ before: 'constant', after: 'constant' })
      expect(evaluateTrack(track, -1000)).toBe(0)
      expect(evaluateTrack(track, 5000)).toBe(100)
    })
  })

  describe('mixed before/after modes', () => {
    it('applies cycle before, constant after', () => {
      const track = makeRampTrack({ before: 'cycle', after: 'constant' })
      expect(evaluateTrack(track, -500)).toBeCloseTo(50, 5) // wraps
      expect(evaluateTrack(track, 1500)).toBe(100) // clamped
    })

    it('applies constant before, cycle after', () => {
      const track = makeRampTrack({ before: 'constant', after: 'cycle' })
      expect(evaluateTrack(track, -500)).toBe(0) // clamped
      expect(evaluateTrack(track, 1500)).toBeCloseTo(50, 5) // wraps
    })
  })
})

import { describe, it, expect } from 'vitest'
import {
  constantOutOfRange,
  wrapTime,
  pingPongTime,
  linearOutOfRangeValue,
  loopBlendValue,
  relativeRepeatOffset,
  detectKeyframeRange,
  resolveOutOfRange,
} from '../resolvers'
import type { OutOfRangeSettings } from '../types'

describe('Out-of-Range Resolvers', () => {
  const t0 = 1000
  const t1 = 2000

  describe('constantOutOfRange', () => {
    it('clamps time below range', () => {
      expect(constantOutOfRange(500, t0, t1)).toBe(t0)
    })

    it('clamps time above range', () => {
      expect(constantOutOfRange(3000, t0, t1)).toBe(t1)
    })

    it('returns time within range unchanged', () => {
      expect(constantOutOfRange(1500, t0, t1)).toBe(1500)
    })

    it('handles edge: at start', () => {
      expect(constantOutOfRange(t0, t0, t1)).toBe(t0)
    })

    it('handles edge: at end', () => {
      expect(constantOutOfRange(t1, t0, t1)).toBe(t1)
    })
  })

  describe('wrapTime', () => {
    it('wraps time below range', () => {
      expect(wrapTime(500, t0, t1)).toBe(1500)
    })

    it('wraps time above range', () => {
      expect(wrapTime(3000, t0, t1)).toBe(1000)
    })

    it('keeps time within range unchanged', () => {
      expect(wrapTime(1500, t0, t1)).toBe(1500)
    })

    it('handles multiple cycles', () => {
      const dur = t1 - t0
      expect(wrapTime(t0 + 2.5 * dur, t0, t1)).toBe(t0 + 0.5 * dur)
    })

    it('handles zero duration', () => {
      expect(wrapTime(1500, t0, t0)).toBe(t0)
    })

    it('handles negative offsets (before range)', () => {
      expect(wrapTime(t0 - 250, t0, t1)).toBe(1750)
    })
  })

  describe('pingPongTime', () => {
    it('bounces back after range', () => {
      expect(pingPongTime(2500, t0, t1)).toBe(1500)
    })

    it('bounces forward before range', () => {
      expect(pingPongTime(500, t0, t1)).toBe(1500)
    })

    it('keeps time within range unchanged', () => {
      expect(pingPongTime(1500, t0, t1)).toBe(1500)
    })

    it('handles full cycle forward-backward', () => {
      const dur = t1 - t0
      // 1.25 cycle = 1 full bounce + 0.25 in = bounces back to position 1750
      expect(pingPongTime(t0 + 1.25 * dur, t0, t1)).toBe(1750)
      // 1.75 cycle = 1 full bounce + 0.75 in = bounces back to position 1250
      expect(pingPongTime(t0 + 1.75 * dur, t0, t1)).toBe(1250)
    })

    it('handles multiple bounces', () => {
      const dur = t1 - t0
      expect(pingPongTime(t0 + 2.5 * dur, t0, t1)).toBe(1500)
    })
  })

  describe('linearOutOfRangeValue', () => {
    it('extrapolates after range with positive velocity', () => {
      // At t=2500 (500ms after t1=2000), velocity=10/ms: 100 + 10*500 = 5100
      const result = linearOutOfRangeValue(2500, t0, t1, 100, 10, true)
      expect(result).toBe(5100)
    })

    it('extrapolates before range with velocity', () => {
      // At t=500 (500ms before t0=1000), velocity=10/ms: 100 + 10*(-500) = -4900
      const result = linearOutOfRangeValue(500, t0, t1, 100, 10, false)
      expect(result).toBe(-4900)
    })

    it('handles zero velocity', () => {
      const result = linearOutOfRangeValue(2500, t0, t1, 100, 0, true)
      expect(result).toBe(100)
    })

    it('handles negative velocity', () => {
      // At t=2500 (500ms after), velocity=-10/ms: 100 + (-10)*500 = -4900
      const result = linearOutOfRangeValue(2500, t0, t1, 100, -10, true)
      expect(result).toBe(-4900)
    })
  })

  describe('loopBlendValue', () => {
    it('returns end value before blend zone', () => {
      expect(loopBlendValue(1800, 0, 100, 1000, 1000, 200)).toBe(100)
    })

    it('blends halfway between end and start values', () => {
      const result = loopBlendValue(1900, 0, 100, 1000, 1000, 200)
      expect(result).toBeCloseTo(50, 5)
    })

    it('returns start value at blend end', () => {
      expect(loopBlendValue(2000, 0, 100, 1000, 1000, 200)).toBe(0)
    })

    it('handles zero blend duration (no blending)', () => {
      expect(loopBlendValue(2100, 0, 100, 1000, 1000, 0)).toBe(100)
    })
  })

  describe('relativeRepeatOffset', () => {
    it('applies value delta for first cycle', () => {
      expect(relativeRepeatOffset(0, 100, 0, 'valueDelta')).toBe(0)
    })

    it('applies value delta for second cycle', () => {
      expect(relativeRepeatOffset(0, 100, 1, 'valueDelta')).toBe(100)
    })

    it('applies value delta for third cycle', () => {
      expect(relativeRepeatOffset(0, 100, 2, 'valueDelta')).toBe(200)
    })

    it('handles negative deltas', () => {
      expect(relativeRepeatOffset(100, 0, 1, 'valueDelta')).toBe(-100)
    })

    it('velocity delta works same as value delta for now', () => {
      expect(relativeRepeatOffset(0, 100, 2, 'velocityDelta')).toBe(200)
    })
  })

  describe('detectKeyframeRange', () => {
    it('returns null for empty array', () => {
      expect(detectKeyframeRange([])).toBeNull()
    })

    it('detects range with single keyframe', () => {
      expect(detectKeyframeRange([1500])).toEqual([1500, 1500])
    })

    it('detects range with multiple keyframes', () => {
      expect(detectKeyframeRange([1000, 2500, 1500])).toEqual([1000, 2500])
    })

    it('sorts keyframes before detecting range', () => {
      expect(detectKeyframeRange([2500, 1000, 1500])).toEqual([1000, 2500])
    })
  })

  describe('resolveOutOfRange', () => {
    const oor: OutOfRangeSettings = {
      before: 'constant',
      after: 'constant',
    }

    it('returns unchanged time within range', () => {
      const result = resolveOutOfRange(1500, oor, t0, t1)
      expect(result.timeMs).toBe(1500)
      expect(result.relativeOffset).toBe(0)
    })

    it('applies before mode for time before range', () => {
      const result = resolveOutOfRange(500, oor, t0, t1)
      expect(result.timeMs).toBe(t0)
    })

    it('applies after mode for time after range', () => {
      const result = resolveOutOfRange(3000, oor, t0, t1)
      expect(result.timeMs).toBe(t1)
    })

    it('uses overridden range if provided', () => {
      const oorOverride: OutOfRangeSettings = {
        before: 'constant',
        after: 'constant',
        rangeStartMs: 1500,
        rangeEndMs: 2500,
      }
      const result = resolveOutOfRange(1200, oorOverride, t0, t1)
      expect(result.timeMs).toBe(1500)
    })

    it('handles cycle mode before', () => {
      const oorCycle: OutOfRangeSettings = {
        before: 'cycle',
        after: 'constant',
      }
      const result = resolveOutOfRange(500, oorCycle, t0, t1)
      expect(result.timeMs).toBe(1500)
    })

    it('handles cycle mode after', () => {
      const oorCycle: OutOfRangeSettings = {
        before: 'constant',
        after: 'cycle',
      }
      const result = resolveOutOfRange(3000, oorCycle, t0, t1)
      expect(result.timeMs).toBe(1000)
    })

    it('handles pingPong mode', () => {
      const oorPong: OutOfRangeSettings = {
        before: 'pingPong',
        after: 'pingPong',
      }
      const result = resolveOutOfRange(2500, oorPong, t0, t1)
      expect(result.timeMs).toBe(1500)
    })

    it('returns undefined settings as constant mode', () => {
      const result = resolveOutOfRange(500, undefined, t0, t1)
      expect(result.timeMs).toBe(t0)
      expect(result.relativeOffset).toBe(0)
    })

    it('tracks relative offset for relativeRepeat', () => {
      const oorRelative: OutOfRangeSettings = {
        before: 'relativeRepeat',
        after: 'relativeRepeat',
      }
      const result = resolveOutOfRange(3000, oorRelative, t0, t1)
      expect(result.relativeOffset).toBeGreaterThanOrEqual(0)
    })
  })
})

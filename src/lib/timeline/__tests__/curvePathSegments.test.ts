import { describe, it, expect } from 'vitest'
import { buildCurvePathSegments, hasNonConstantOutOfRange } from '../curveMath'
import type { Track } from '../../types'
import type { CurveViewport } from '../curveMath'

function makeTrack(outOfRange?: Track['outOfRange']): Track {
  return {
    target: 'layers.x.opacity',
    keyframes: [
      { id: 'k1', timeMs: 1000, value: 0,   easing: { type: 'linear' } },
      { id: 'k2', timeMs: 2000, value: 100, easing: { type: 'linear' } },
    ],
    outOfRange,
  }
}

const VP: CurveViewport = {
  startMs: 0,
  endMs: 3000,
  range: { min: 0, max: 100 },
  widthPx: 600,
  heightPx: 200,
}

describe('buildCurvePathSegments (BL-45)', () => {
  it('returns empty paths for empty track', () => {
    const track: Track = { target: 'x', keyframes: [] }
    const result = buildCurvePathSegments(track, VP)
    expect(result.before).toBe('')
    expect(result.inRange).toBe('')
    expect(result.after).toBe('')
    expect(result.rangeStartX).toBeNull()
    expect(result.rangeEndX).toBeNull()
  })

  it('emits in-range path between keyframes (constant default)', () => {
    const track = makeTrack()
    const result = buildCurvePathSegments(track, VP)
    expect(result.inRange.length).toBeGreaterThan(0)
    expect(result.inRange).toMatch(/^M /) // starts with move-to
  })

  it('emits before-range path samples when viewport extends left of first keyframe', () => {
    const track = makeTrack({ before: 'cycle', after: 'constant' })
    const result = buildCurvePathSegments(track, VP)
    // viewport [0, 3000] with kf range [1000, 2000] → before/after both populated
    expect(result.before.length).toBeGreaterThan(0)
    expect(result.after.length).toBeGreaterThan(0)
    expect(result.inRange.length).toBeGreaterThan(0)
  })

  it('emits after-range path samples when viewport extends right of last keyframe', () => {
    const track = makeTrack({ before: 'constant', after: 'cycle' })
    const result = buildCurvePathSegments(track, VP)
    expect(result.after.length).toBeGreaterThan(0)
  })

  it('returns pixel X coords for range boundaries in viewport', () => {
    const track = makeTrack({ before: 'cycle', after: 'cycle' })
    const result = buildCurvePathSegments(track, VP)
    // rangeStart=1000 in viewport [0,3000] of widthPx=600 → x = 600 * 1000/3000 = 200
    expect(result.rangeStartX).toBeCloseTo(200, 1)
    // rangeEnd=2000 → x = 600 * 2000/3000 = 400
    expect(result.rangeEndX).toBeCloseTo(400, 1)
  })

  it('returns null boundary coords when range outside viewport', () => {
    const track: Track = {
      target: 'x',
      keyframes: [
        { id: 'k1', timeMs: 10000, value: 0,   easing: { type: 'linear' } },
        { id: 'k2', timeMs: 20000, value: 100, easing: { type: 'linear' } },
      ],
      outOfRange: { before: 'cycle', after: 'cycle' },
    }
    const result = buildCurvePathSegments(track, VP)
    expect(result.rangeStartX).toBeNull()
    expect(result.rangeEndX).toBeNull()
  })

  it('each segment starts with M (move-to), not L (line-to)', () => {
    const track = makeTrack({ before: 'cycle', after: 'cycle' })
    const result = buildCurvePathSegments(track, VP)
    if (result.before.length > 0)  expect(result.before).toMatch(/^M /)
    if (result.inRange.length > 0) expect(result.inRange).toMatch(/^M /)
    if (result.after.length > 0)   expect(result.after).toMatch(/^M /)
  })
})

describe('hasNonConstantOutOfRange (BL-45)', () => {
  it('returns false for undefined outOfRange', () => {
    const track = makeTrack(undefined)
    expect(hasNonConstantOutOfRange(track)).toBe(false)
  })

  it('returns false for constant/constant (explicit)', () => {
    const track = makeTrack({ before: 'constant', after: 'constant' })
    expect(hasNonConstantOutOfRange(track)).toBe(false)
  })

  it('returns true when before is non-constant', () => {
    const track = makeTrack({ before: 'cycle', after: 'constant' })
    expect(hasNonConstantOutOfRange(track)).toBe(true)
  })

  it('returns true when after is non-constant', () => {
    const track = makeTrack({ before: 'constant', after: 'loop' })
    expect(hasNonConstantOutOfRange(track)).toBe(true)
  })

  it('returns true when both sides are non-constant', () => {
    const track = makeTrack({ before: 'pingPong', after: 'cycle' })
    expect(hasNonConstantOutOfRange(track)).toBe(true)
  })
})

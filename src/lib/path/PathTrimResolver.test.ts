import { describe, it, expect } from 'vitest'
import { PathTrimResolver } from './PathTrimResolver'

const r = PathTrimResolver

describe('PathTrimResolver', () => {
  describe('static mode', () => {
    it('basic start/end', () => {
      expect(r.resolve({ start: 0.2, end: 0.8, offset: 0 })).toEqual([{ start: 0.2, end: 0.8 }])
    })

    it('offset shifts both ends', () => {
      expect(r.resolve({ start: 0.0, end: 0.4, offset: 0.3 })).toEqual([{ start: 0.3, end: 0.7 }])
    })

    it('clamps to [0, 1]', () => {
      expect(r.resolve({ start: -0.5, end: 1.5, offset: 0 })).toEqual([{ start: 0, end: 1 }])
    })

    it('inverted (end <= start) → empty', () => {
      expect(r.resolve({ start: 0.7, end: 0.3, offset: 0 })).toEqual([])
    })
  })

  describe('movingSegment mode', () => {
    it('no wrap: returns single segment', () => {
      const segs = r.resolve({ start: 0, end: 1, offset: 0.2, mode: 'movingSegment', segmentLength: 0.3 })
      expect(segs).toHaveLength(1)
      expect(segs[0].start).toBeCloseTo(0.2, 6)
      expect(segs[0].end  ).toBeCloseTo(0.5, 6)
    })

    it('wrap-around: two segments', () => {
      const segs = r.resolve({ start: 0, end: 1, offset: 0.8, mode: 'movingSegment', segmentLength: 0.3 })
      expect(segs).toHaveLength(2)
      expect(segs[0]).toEqual({ start: 0.8, end: 1 })
      expect(segs[1].start).toBe(0)
      expect(segs[1].end).toBeCloseTo(0.1, 6)
    })

    it('offset > 1 wraps cleanly (offset = 1.5 same as 0.5)', () => {
      const a = r.resolve({ start: 0, end: 1, offset: 1.5, mode: 'movingSegment', segmentLength: 0.2 })
      const b = r.resolve({ start: 0, end: 1, offset: 0.5, mode: 'movingSegment', segmentLength: 0.2 })
      expect(a).toEqual(b)
    })

    it('zero segmentLength → empty', () => {
      expect(r.resolve({ start: 0, end: 1, offset: 0.5, mode: 'movingSegment', segmentLength: 0 })).toEqual([])
    })

    it('negative offset wraps from end', () => {
      const segs = r.resolve({ start: 0, end: 1, offset: -0.1, mode: 'movingSegment', segmentLength: 0.2 })
      // offset = -0.1 → wrap → 0.9, segment = [0.9, 1.1] → wraps
      expect(segs).toHaveLength(2)
      expect(segs[0].start).toBeCloseTo(0.9, 6)
    })
  })
})

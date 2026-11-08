import { describe, expect, it } from 'vitest'
import { requireFrameBytes, rgbaFrameBytes } from './frameBytes'

describe('one-frame pixel policy', () => {
  it('is invariant under orientation axis exchange and accounts for one RGBA8 frame', () => {
    expect(rgbaFrameBytes(1920, 1080)).toBe(8294400)
    expect(rgbaFrameBytes(1080, 1920)).toBe(rgbaFrameBytes(1920, 1080))
  })
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER])('never treats invalid dimension %s as zero admission', dimension => {
    expect(rgbaFrameBytes(dimension, 2)).toBeNull()
    expect(() => requireFrameBytes(dimension, 2)).toThrow('invalid')
  })
  it('keeps unknown metadata distinct and checks both dimension and byte limits inclusively', () => {
    expect(rgbaFrameBytes(undefined, 2)).toBeNull()
    const limits = { maxDimension: 8, maxFrameBytes: 64 }
    expect(requireFrameBytes(8, 2, limits)).toBe(64)
    expect(() => requireFrameBytes(9, 1, limits)).toThrow('limit')
    expect(() => requireFrameBytes(8, 3, limits)).toThrow('limit')
  })
})

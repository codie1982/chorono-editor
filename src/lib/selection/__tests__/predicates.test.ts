import { describe, it, expect } from 'vitest'
import {
  normalizeAngle, angleNear, nearVector, boundsIntersect,
  numberNear, inRange,
  stringEquals, stringContains, stringStartsWith, stringEndsWith,
} from '../predicates'

describe('normalizeAngle', () => {
  it('leaves values inside [-180, 180] unchanged', () => {
    expect(normalizeAngle(0)).toBe(0)
    expect(normalizeAngle(90)).toBe(90)
    expect(normalizeAngle(-179)).toBe(-179)
    expect(normalizeAngle(180)).toBe(180)
  })

  it('wraps values above 180', () => {
    expect(normalizeAngle(270)).toBe(-90)
    expect(normalizeAngle(360)).toBe(0)
    expect(normalizeAngle(540)).toBe(180)
  })

  it('wraps values below -180', () => {
    expect(normalizeAngle(-270)).toBe(90)
    // -360 produces -0 in JS modulo; that's mathematically 0, accept either.
    expect(Math.abs(normalizeAngle(-360))).toBe(0)
  })
})

describe('angleNear', () => {
  it('matches exact angles', () => {
    expect(angleNear(45, 45, 1)).toBe(true)
    expect(angleNear(45, 50, 1)).toBe(false)
    expect(angleNear(45, 50, 5)).toBe(true)
  })

  it('handles wraparound (350° vs 10°)', () => {
    expect(angleNear(350, 10, 10)).toBe(false) // diff = 20
    expect(angleNear(350, 10, 20)).toBe(true)  // exactly at tolerance
    expect(angleNear(350, 10, 30)).toBe(true)
  })

  it('handles negative wraparound (-170° vs 170°)', () => {
    expect(angleNear(-170, 170, 25)).toBe(true)  // diff = 20
    expect(angleNear(-170, 170, 15)).toBe(false)
  })
})

describe('nearVector', () => {
  it('hits exact match', () => {
    expect(nearVector({ x: 1, y: 2 }, { x: 1, y: 2 }, 0)).toBe(true)
  })

  it('respects euclidean distance', () => {
    expect(nearVector({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true)
    expect(nearVector({ x: 0, y: 0 }, { x: 3, y: 4 }, 4.999)).toBe(false)
  })
})

describe('boundsIntersect', () => {
  it('detects overlapping AABBs', () => {
    expect(boundsIntersect(
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 5, y: 5, w: 10, h: 10 },
    )).toBe(true)
  })

  it('returns false for non-overlapping AABBs', () => {
    expect(boundsIntersect(
      { x: 0,  y: 0, w: 10, h: 10 },
      { x: 20, y: 0, w: 10, h: 10 },
    )).toBe(false)
  })

  it('touching edges count as intersecting', () => {
    expect(boundsIntersect(
      { x: 0,  y: 0, w: 10, h: 10 },
      { x: 10, y: 0, w: 10, h: 10 },
    )).toBe(true)
  })
})

describe('numberNear', () => {
  it('exact zero tolerance', () => {
    expect(numberNear(5, 5, 0)).toBe(true)
    expect(numberNear(5, 6, 0)).toBe(false)
  })

  it('within tolerance', () => {
    expect(numberNear(5, 5.4, 0.5)).toBe(true)
    expect(numberNear(5, 5.6, 0.5)).toBe(false)
  })
})

describe('inRange', () => {
  it('inclusive endpoints', () => {
    expect(inRange(5, 0, 10)).toBe(true)
    expect(inRange(0, 0, 10)).toBe(true)
    expect(inRange(10, 0, 10)).toBe(true)
    expect(inRange(11, 0, 10)).toBe(false)
  })

  it('accepts swapped min/max', () => {
    expect(inRange(5, 10, 0)).toBe(true) // [0, 10] still works
  })
})

describe('string predicates', () => {
  it('stringEquals — case sensitive vs ignore', () => {
    expect(stringEquals('Foo', 'foo', true)).toBe(true)
    expect(stringEquals('Foo', 'foo', false)).toBe(false)
  })

  it('stringContains', () => {
    expect(stringContains('Background', 'bg', true)).toBe(false)
    expect(stringContains('Background', 'back', true)).toBe(true)
    expect(stringContains('Background', 'BACK', false)).toBe(false)
  })

  it('stringStartsWith', () => {
    expect(stringStartsWith('Background', 'back', true)).toBe(true)
    expect(stringStartsWith('Background', 'ground', true)).toBe(false)
  })

  it('stringEndsWith', () => {
    expect(stringEndsWith('Background', 'ground', true)).toBe(true)
    expect(stringEndsWith('Background', 'BACK', true)).toBe(false)
  })
})

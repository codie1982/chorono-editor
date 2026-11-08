import { describe, expect, it } from 'vitest'
import { C, L, M, Q, Z, type PathDefinition } from '@/lib/geometry/PathCommand'
import { trimSplinePath } from './trimSplinePath'

describe('trimSplinePath', () => {
  const line: PathDefinition = { commands: [M(0, 0), L(100, 0)], closed: false }

  it('trims a line to the requested arc-length range', () => {
    expect(trimSplinePath(line, 0.25, 0.75)).toEqual({
      commands: [M(25, 0), L(75, 0)], closed: false,
    })
  })

  it('emits no geometry for an empty or inverted window (no round-cap dots)', () => {
    expect(trimSplinePath(line, 0, 0).commands).toEqual([])
    expect(trimSplinePath(line, 0.8, 0.2).commands).toEqual([])
  })

  it('keeps complete closed paths and their joins when the window is full', () => {
    const triangle = { commands: [M(0, 0), L(50, 0), L(25, 40), Z()], closed: true }
    expect(trimSplinePath(triangle, 0, 1, 0.65)).toBe(triangle)
  })

  it('does not bridge disconnected contours or count a move as length', () => {
    const compound = { commands: [M(0, 0), L(100, 0), M(500, 100), L(600, 100)], closed: false }
    expect(trimSplinePath(compound, 0.25, 0.75)).toEqual({
      commands: [M(50, 0), L(100, 0), M(500, 100), L(550, 100)], closed: false,
    })
  })

  it('splits a quadratic into an exact quadratic subcurve', () => {
    const curve = { commands: [M(0, 0), Q(50, 100, 100, 0)], closed: false }
    const partial = trimSplinePath(curve, 0, 0.5)
    expect(partial.commands).toHaveLength(2)
    expect(partial.commands[1].type).toBe('Q')
    const q = partial.commands[1] as ReturnType<typeof Q>
    expect(q.x1).toBeCloseTo(25)
    expect(q.y1).toBeCloseTo(50)
    expect(q.x).toBeCloseTo(50)
    expect(q.y).toBeCloseTo(50)
  })

  it('splits a cubic into an exact cubic subcurve', () => {
    const curve = { commands: [M(0, 0), C(0, 100, 100, 100, 100, 0)], closed: false }
    const partial = trimSplinePath(curve, 0.5, 1)
    const move = partial.commands[0] as ReturnType<typeof M>
    const c = partial.commands[1] as ReturnType<typeof C>
    expect(move.x).toBeCloseTo(50)
    expect(move.y).toBeCloseTo(75)
    expect(c.type).toBe('C')
    expect(c.x1).toBeCloseTo(75)
    expect(c.y1).toBeCloseTo(75)
    expect(c.x2).toBeCloseTo(100)
    expect(c.y2).toBeCloseTo(50)
    expect(c.x).toBeCloseTo(100)
    expect(c.y).toBeCloseTo(0)
  })

  it('emits two open ranges when the offset wraps past the path end', () => {
    expect(trimSplinePath(line, 0, 0.5, 0.75)).toEqual({
      commands: [M(75, 0), L(100, 0), M(0, 0), L(25, 0)], closed: false,
    })
  })

  it('wraps negative offsets without dropping the visible length', () => {
    const partial = trimSplinePath(line, 0, 0.5, -0.25)
    expect(partial).toEqual(trimSplinePath(line, 0, 0.5, 0.75))
  })

  it('trims closing edges as lines without closing partial paths', () => {
    const box = { commands: [M(0, 0), L(100, 0), L(100, 100), L(0, 100), Z()], closed: true }
    expect(trimSplinePath(box, 0.75, 1)).toEqual({
      commands: [M(0, 100), L(0, 0)], closed: false,
    })
  })
})

import { describe, expect, it } from 'vitest'
import { intersectBezierCurves, intersectBezierRay, bezierSelfIntersections } from './intersections'

describe('bounded polynomial Bézier intersections', () => {
  it('finds a single cubic loop crossing from its two independent parameter values', () => {
    const hits = bezierSelfIntersections([{ x: .1875, y: 0 }, { x: .1875 - 1 / 3, y: .0625 }, { x: .1875 - 1 / 3, y: -.20833333333333333 }, { x: .1875, y: .1875 }])
    expect(hits).toHaveLength(1); expect(hits[0].t).toBeCloseTo(.25, 9); expect(hits[0].u).toBeCloseTo(.75, 9)
  })
  it('retains crossing and tangent line/Q/C roots, including endpoints', () => {
    const line = [{ x: -2, y: 0 }, { x: 2, y: 0 }]
    expect(intersectBezierCurves(line, [{ x: 0, y: -1 }, { x: 0, y: 1 }])[0].t).toBeCloseTo(.5)
    const tangent = intersectBezierCurves(line, [{ x: -1, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 1 }])
    expect(tangent).toHaveLength(1); expect(tangent[0].u).toBeCloseTo(.5, 10)
    const cubic = [{ x: -1, y: -1 }, { x: -1 / 3, y: 2 }, { x: 1 / 3, y: -2 }, { x: 1, y: 1 }]
    expect(intersectBezierCurves(line, cubic)).toHaveLength(3)
    expect(intersectBezierCurves([{ x: 0, y: 0 }, { x: 1, y: 0 }], [{ x: 1, y: 0 }, { x: 1, y: 1 }])[0]).toMatchObject({ t: 1, u: 0 })
  })
  it('uses all forward roots and ignores backward/origin contacts', () => {
    const origin = { x: 0, y: 0 }, direction = { x: 4, y: 0 }
    expect(intersectBezierRay(origin, direction, [{ x: -2, y: -1 }, { x: -2, y: 1 }])).toEqual([])
    expect(intersectBezierRay(origin, direction, [{ x: 0, y: -1 }, { x: 0, y: 1 }])).toEqual([])
    expect(intersectBezierRay(origin, direction, [{ x: 5, y: 1 }, { x: 6, y: -1 }, { x: 7, y: 1 }])[0].distance).toBeCloseTo(6)
  })
  it('refuses collinear overlap without inventing a destructive intersection', () => {
    expect(() => intersectBezierCurves([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 5, y: 0 }, { x: 15, y: 0 }])).toThrow('Overlapping')
    expect(() => intersectBezierRay({ x: 0, y: 0 }, { x: 1, y: 0 }, [{ x: 5, y: 0 }, { x: 10, y: 0 }])).toThrow('overlaps')
  })
  it('finds regular curve/curve crossings and prunes disjoint control hulls', () => {
    const a = [{ x: 0, y: 0 }, { x: 30, y: 10 }, { x: 70, y: 90 }, { x: 100, y: 100 }]
    const b = a.map(p => ({ x: p.x, y: 100 - p.y })), hits = intersectBezierCurves(a, b)
    expect(hits).toHaveLength(1); expect(hits[0].t).toBeCloseTo(.5, 6); expect(hits[0].u).toBeCloseTo(.5, 6)
    expect(intersectBezierCurves(a, b.map(p => ({ x: p.x + 1000, y: p.y })))).toEqual([])
  })
  it('does not collapse two nearby curve crossings into one Newton result', () => {
    const a = [{ x: 0, y: 0 }, { x: 1 / 3, y: 0 }, { x: 2 / 3, y: 0 }, { x: 1, y: 0 }]
    const b = [{ x: 0, y: .249999 }, { x: .5, y: -.250001 }, { x: 1, y: .249999 }]
    const hits = intersectBezierCurves(a, b)
    expect(hits).toHaveLength(2); expect(hits[0].t).toBeCloseTo(.499, 5); expect(hits[1].t).toBeCloseTo(.501, 5)
  })
})

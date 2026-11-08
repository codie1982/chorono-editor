import { describe, expect, it } from 'vitest'
import { Matrix2D } from '../geometry/Matrix2D'
import { transformBezierPath } from './transformBezierPath'

describe('Bezier path affine conversion', () => {
  it('moves absolute handles and anchors together without changing topology or source', () => {
    const path = { closed: true, anchors: [{ x: 10, y: 20, inX: 5, inY: 12, outX: 15, outY: 28, pointType: 'mirror' as const }, { x: 30, y: 40 }] }
    const before = structuredClone(path), matrix = Matrix2D.translation(100, -50).rotate(90).scale(-2, 3)
    const converted = transformBezierPath(path, matrix)
    expect(converted.anchors[0]).toEqual({ x: 40, y: -70, inX: 64, inY: -60, outX: 16, outY: -80, pointType: 'mirror' })
    expect(converted.closed).toBe(true); expect(converted.anchors).toHaveLength(2)
    expect(path).toEqual(before)
    const restored = transformBezierPath(converted, matrix.invert())
    restored.anchors.forEach((anchor, i) => {
      expect(anchor.x).toBeCloseTo(path.anchors[i].x)
      expect(anchor.y).toBeCloseTo(path.anchors[i].y)
    })
  })
})

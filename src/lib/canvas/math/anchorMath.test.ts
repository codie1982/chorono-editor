import { describe, expect, it } from 'vitest'
import type { Transform } from '@/lib/types'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { calculateAnchorMove, reanchorTransform } from './anchorMath'

function renderedMatrix(t: Transform, parent = Matrix2D.identity()) {
  return parent.translate(t.x + t.anchorX, t.y + t.anchorY)
    .rotate(t.rotationDeg).scale(t.scaleX, t.scaleY).translate(-t.anchorX, -t.anchorY)
}

const base: Transform = {
  x: 70, y: 90, anchorX: 12, anchorY: -8, rotationDeg: 65, scaleX: 2, scaleY: 0.6,
}

function expectArtworkUnchanged(before: Transform, after: Transform, parent = Matrix2D.identity()) {
  for (const point of [{ x: 0, y: 0 }, { x: 120, y: 50 }, { x: -60, y: 80 }]) {
    const a = renderedMatrix(before, parent).applyToPoint(point)
    const b = renderedMatrix(after, parent).applyToPoint(point)
    expect(b.x).toBeCloseTo(a.x, 8)
    expect(b.y).toBeCloseTo(a.y, 8)
  }
}

describe('anchor gestures and recentering preserve the artwork', () => {
  it('reanchors rotated/scaled artwork without changing its rendered pose', () => {
    const centered = reanchorTransform(base, 50, 25)
    expect(centered.anchorX).toBe(50)
    expect(centered.anchorY).toBe(25)
    expectArtworkUnchanged(base, centered)
    expectArtworkUnchanged(base, centered, Matrix2D.translation(300, 200).rotate(-30).scale(-2, 0.5))
  })

  it('moves the displayed pivot with the cursor through a rotated/reflected parent', () => {
    const parent = Matrix2D.translation(400, 200).rotate(32).scale(-1.5, 0.7)
    const result = calculateAnchorMove({ ...base, parentWorld: parent,
      dx: 24, dy: -13, snapGrid: false, snapPixel: false, gridSize: 10 })
    const after = { ...base, ...result }
    const a = parent.applyToPoint({ x: base.x + base.anchorX, y: base.y + base.anchorY })
    const b = parent.applyToPoint({ x: after.x + after.anchorX, y: after.y + after.anchorY })
    expect(b.x - a.x).toBeCloseTo(24, 8)
    expect(b.y - a.y).toBeCloseTo(-13, 8)
    expectArtworkUnchanged(base, after, parent)
  })

  it('snaps the displayed pivot in composition space under a scaled parent', () => {
    const parent = Matrix2D.translation(100, 50).rotate(90).scale(2, 1)
    const t = { ...base, x: 20, y: 10, anchorX: 0, anchorY: 0 }
    // Pivot starts at (90,90). Cursor (13,-7) → (103,83) → grid (100,80).
    const result = calculateAnchorMove({ ...t, parentWorld: parent,
      dx: 13, dy: -7, snapGrid: true, snapPixel: false, gridSize: 10 })
    const after = { ...t, ...result }
    const pivot = parent.applyToPoint({ x: after.x + after.anchorX, y: after.y + after.anchorY })
    expect(pivot.x).toBeCloseTo(100)
    expect(pivot.y).toBeCloseTo(80)
    expectArtworkUnchanged(t, after, parent)
  })

  it('declines a collapsed transform without producing invalid anchors', () => {
    const t = { ...base, scaleX: 0 }
    expect(calculateAnchorMove({ ...t, dx: 20, dy: 30,
      snapGrid: false, snapPixel: false, gridSize: 10 }))
      .toEqual({ x: t.x, y: t.y, anchorX: t.anchorX, anchorY: t.anchorY })
  })
})

import { describe, expect, it } from 'vitest'
import type { Layer, Transform } from '../types'
import { newRectLayer, newSplineLayerFromData, newSplineLayerFromPrimitive } from '../defaults'
import { translateSplineData } from '../spline/geometry/translateSplineData'
import { createRectangleSpline } from '../spline/primitives/createRectangleSpline'
import { Matrix2D } from '../geometry/Matrix2D'
import { centerOrigin, rotate90CW } from './layerTransforms'

function matrix(transform: Transform): Matrix2D {
  return Matrix2D.translation(transform.x + transform.anchorX, transform.y + transform.anchorY)
    .rotate(transform.rotationDeg)
    .scale(transform.scaleX, transform.scaleY)
    .translate(-transform.anchorX, -transform.anchorY)
}

function expectAppearancePreserved(before: Layer, after: Layer) {
  for (const point of [{ x: -90, y: 35 }, { x: 0, y: 0 }, { x: 60, y: 140 }]) {
    const original = matrix(before.transform).applyToPoint(point)
    const centered = matrix(after.transform).applyToPoint(point)
    expect(centered.x).toBeCloseTo(original.x, 8)
    expect(centered.y).toBeCloseTo(original.y, 8)
  }
  expect(after.transform.rotationDeg).toBe(before.transform.rotationDeg)
  expect(after.transform.scaleX).toBe(before.transform.scaleX)
  expect(after.transform.scaleY).toBe(before.transform.scaleY)
}

describe('centerOrigin', () => {
  it('keeps a centered spline pivot at zero instead of guessing a 40px offset', () => {
    const layer = newSplineLayerFromPrimitive('circle', { radius: 80 })!
    Object.assign(layer.transform, { x: 300, y: 200, rotationDeg: 70, scaleX: 1.5, scaleY: 0.7 })
    const centered = centerOrigin(layer)
    expect(centered.transform.anchorX).toBe(0)
    expect(centered.transform.anchorY).toBe(0)
    expectAppearancePreserved(layer, centered)
  })

  it('centers an off-origin spline while preserving its rotated/reflected artwork', () => {
    const geometry = translateSplineData(createRectangleSpline({ width: 80, height: 40 }), 70, -25)
    const layer = newSplineLayerFromData(geometry, { x: 300, y: 200 })
    Object.assign(layer.transform, { anchorX: -10, anchorY: 15, rotationDeg: 37, scaleX: -1.5, scaleY: 0.7 })
    const centered = centerOrigin(layer)
    expect(centered.transform.anchorX).toBe(70)
    expect(centered.transform.anchorY).toBe(-25)
    expect(centered.spline).toBe(layer.spline)
    expect(layer.transform.anchorX).toBe(-10)
    expectAppearancePreserved(layer, centered)
    // Subsequent rotation uses the new center as a stationary pivot.
    const rotated = rotate90CW(centered)
    const point = { x: 70, y: -25 }
    const beforeRotation = matrix(centered.transform).applyToPoint(point)
    const afterRotation = matrix(rotated.transform).applyToPoint(point)
    expect(afterRotation.x).toBeCloseTo(beforeRotation.x, 8)
    expect(afterRotation.y).toBeCloseTo(beforeRotation.y, 8)
  })

  it('centers a curved path on actual extrema before a retained stale size box', () => {
    const layer: Layer = {
      ...newRectLayer(), type: 'path',
      size: { width: 1000, height: 1000 },
      path: { closed: false, anchors: [
        { x: 20, y: 10, outX: 20, outY: 110 },
        { x: 120, y: 10, inX: 120, inY: 110 },
      ] },
    }
    Object.assign(layer.transform, { anchorX: 0, anchorY: 0, rotationDeg: 90, scaleX: 2, scaleY: 0.5 })
    const centered = centerOrigin(layer)
    expect(centered.transform.anchorX).toBe(70)
    expect(centered.transform.anchorY).toBe(47.5)
    expect(centered.path).toBe(layer.path)
    expectAppearancePreserved(layer, centered)
  })

  it('centers a normal sized shape without moving it', () => {
    const layer = newRectLayer()
    Object.assign(layer.transform, { anchorX: 0, anchorY: 0, rotationDeg: -55, scaleX: 2, scaleY: -3 })
    const centered = centerOrigin(layer)
    expect(centered.transform.anchorX).toBe(layer.size!.width / 2)
    expect(centered.transform.anchorY).toBe(layer.size!.height / 2)
    expectAppearancePreserved(layer, centered)
  })

  it('keeps explicit pivots when the layer has no geometry to center', () => {
    const group: Layer = { ...newRectLayer(), type: 'group', size: undefined }
    Object.assign(group.transform, { anchorX: -12, anchorY: 34 })
    expect(centerOrigin(group)).toBe(group)
    const emptyPath: Layer = { ...group, type: 'path', path: { anchors: [], closed: false } }
    expect(centerOrigin(emptyPath)).toBe(emptyPath)
  })
})

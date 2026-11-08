import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromPrimitive } from '@/lib/defaults'
import { computeSplineWorldBounds } from './computeSplineWorldBounds'

describe('spline world bounds for viewport fitting', () => {
  it('fits centered geometry without requiring a size field', () => {
    const scene = emptyScene()
    const layer = newSplineLayerFromPrimitive('circle', { radius: 40 })!
    scene.layers = [layer]
    const bounds = computeSplineWorldBounds(layer, scene)!
    expect(layer.size).toBeUndefined()
    expect(bounds).toEqual({ x: 40, y: 40, width: 80, height: 80 })
    expect(bounds.x + bounds.width / 2).toBe(80)
    expect(bounds.y + bounds.height / 2).toBe(80)
  })

  it('centers the displayed position and keeps reflected extents positive', () => {
    const scene = emptyScene()
    const layer = newSplineLayerFromPrimitive('rectangle', { width: 40, height: 20 })!
    scene.layers = [layer]
    const overrides = new Map([
      [`layers.${layer.id}.transform.x`, 300],
      [`layers.${layer.id}.transform.y`, 200],
      [`layers.${layer.id}.transform.scaleX`, -2],
      [`layers.${layer.id}.transform.scaleY`, 3],
    ])
    expect(computeSplineWorldBounds(layer, scene, 500, overrides)).toEqual({
      x: 260, y: 170, width: 80, height: 60,
    })
  })

  it('keeps a rotated 160px circle bounded by its drawn diameter', () => {
    const scene = emptyScene()
    const layer = newSplineLayerFromPrimitive('circle', { radius: 80 })!
    Object.assign(layer.transform, { x: 300, y: 220, rotationDeg: 45 })
    scene.layers = [layer]
    const bounds = computeSplineWorldBounds(layer, scene)!
    expect(bounds.x).toBeCloseTo(220)
    expect(bounds.y).toBeCloseTo(140)
    expect(bounds.width).toBeCloseTo(160)
    expect(bounds.height).toBeCloseTo(160)
    expect(layer.size).toBeUndefined()
  })

  it('solves curve bounds after the displayed parent transform and nonuniform scale', () => {
    const scene = emptyScene()
    const parent = newSplineLayerFromPrimitive('rectangle', { width: 10, height: 10 })!
    parent.type = 'group'
    Object.assign(parent.transform, { x: 400, y: 300, rotationDeg: 45, scaleX: 2, scaleY: 1 })
    const layer = newSplineLayerFromPrimitive('circle', { radius: 80 })!
    Object.assign(layer.transform, { x: 0, y: 0 })
    layer.parentId = parent.id
    scene.layers = [parent, layer]
    const overrides = new Map([[`layers.${parent.id}.transform.x`, 500]])
    const bounds = computeSplineWorldBounds(layer, scene, 900, overrides)!
    // A 160×80-radius ellipse rotated 45°. Cubic kappa approximation differs
    // from the ideal ellipse by at most ~0.03%, rather than using its box.
    const radius = Math.hypot(160 / Math.sqrt(2), 80 / Math.sqrt(2))
    expect(Math.abs(bounds.width / 2 - radius)).toBeLessThan(0.05)
    expect(Math.abs(bounds.height / 2 - radius)).toBeLessThan(0.05)
    expect(bounds.x + bounds.width / 2).toBeCloseTo(500)
    expect(bounds.y + bounds.height / 2).toBeCloseTo(300)
  })
})

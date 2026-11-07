import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromPrimitive } from '@/lib/defaults'
import type { Layer } from '@/lib/types'
import { hitTestSplinePoint } from '@/lib/spline/geometry/hitTest'
import { SnapEngine } from '@/lib/snap/SnapEngine'
import { resolveSplineEditGeometry, resolveSplineMoveBounds } from './splineEditGeometry'

function groupedSpline() {
  const scene = emptyScene()
  const parent: Layer = {
    id: 'group', name: 'Rotated Group', type: 'group', opacity: 1,
    transform: { x: 100, y: 50, rotationDeg: 90, scaleX: 2, scaleY: 3, anchorX: 0, anchorY: 0 },
  }
  const layer = newSplineLayerFromPrimitive('rectangle', { width: 40, height: 20 })!
  layer.parentId = parent.id
  layer.transform = { x: 10, y: 20, rotationDeg: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0 }
  scene.layers = [parent, layer]
  return { scene, layer }
}

describe('spline editing in rendered coordinates', () => {
  it('picks the rendered point through rotated and scaled parents', () => {
    const { scene, layer } = groupedSpline()
    const edit = resolveSplineEditGeometry(layer, scene, 0)!
    const point = Object.values(layer.spline!.points).find(p => p.x === -20 && p.y === -10)!
    // (-20,-10) → child (-10,10) → parent scale (-20,30)
    // → rotate (-30,-20) → translate (70,30).
    expect(edit.worldSpline.points[point.id].x).toBeCloseTo(70)
    expect(edit.worldSpline.points[point.id].y).toBeCloseTo(30)
    expect(hitTestSplinePoint(edit.worldSpline, 73, 30, 4)).toBe(point.id)
    expect(hitTestSplinePoint(edit.worldSpline, 75, 30, 4)).toBeNull()
  })

  it('converts a cursor delta back to local axes without a jump', () => {
    const { scene, layer } = groupedSpline()
    const edit = resolveSplineEditGeometry(layer, scene, 0)!
    const delta = edit.worldToLocal.applyToVector({ x: 0, y: 20 })
    expect(delta.x).toBeCloseTo(10)
    expect(delta.y).toBeCloseTo(0)
    const before = edit.worldMatrix.applyToPoint({ x: -20, y: -10 })
    const after = edit.worldMatrix.applyToPoint({ x: -20 + delta.x, y: -10 + delta.y })
    expect(after.x - before.x).toBeCloseTo(0)
    expect(after.y - before.y).toBeCloseTo(20)
  })

  it('picks the displayed animated position, including a custom pivot', () => {
    const { scene, layer } = groupedSpline()
    layer.transform.anchorX = 5
    layer.transform.anchorY = 7
    const overrides = new Map([
      [`layers.${layer.id}.transform.x`, 30],
      [`layers.${layer.id}.transform.rotationDeg`, 90],
    ])
    const edit = resolveSplineEditGeometry(layer, scene, 500, overrides)!
    const point = Object.values(layer.spline!.points)[0]
    const world = edit.worldMatrix.applyToPoint(point)
    expect(hitTestSplinePoint(edit.worldSpline, world.x, world.y, 1)).toBe(point.id)
    const local = edit.worldToLocal.applyToPoint(world)
    expect(local.x).toBeCloseTo(point.x)
    expect(local.y).toBeCloseTo(point.y)
  })

  it('does not start an edit on a collapsed transform', () => {
    const { scene, layer } = groupedSpline()
    scene.layers[0].transform.scaleX = 0
    expect(resolveSplineEditGeometry(layer, scene, 0)).toBeNull()
  })
})

describe('spline move bounds', () => {
  it('snaps a centered circle by its visible edge rather than a fake size', () => {
    const scene = emptyScene()
    const layer = newSplineLayerFromPrimitive('circle', { radius: 80 })!
    layer.transform.x = 300
    layer.transform.y = 200
    scene.layers = [layer]
    const bounds = resolveSplineMoveBounds(layer, scene, 0)!
    expect(bounds).toEqual({ width: 160, height: 160, boundsOffsetX: -80, boundsOffsetY: -80 })
    const engine = new SnapEngine({
      enabled: true, radiusPx: 5,
      targets: { objects: true, points: false, grid: false, guides: false, pixel: false, vertex: false, segment: false },
      grid: { sizePx: 10 }, angle: { enabled: false, stepDeg: 15 }, scale: { enabled: false, stepPercent: 10 },
    })
    // Moving the circle to x=81 puts its visible left edge at x=1. Snap that
    // edge to the artboard, then recover its center (rather than moving it to 0).
    const snapped = engine.snapRect(
      { x: 81 + bounds.boundsOffsetX, y: 200 + bounds.boundsOffsetY, width: bounds.width, height: bounds.height },
      { canvasWidth: 960, canvasHeight: 540, otherLayers: [] },
    )
    expect(snapped.point.x - bounds.boundsOffsetX).toBe(80)
  })

  it('keeps parent-local moves on the existing separate path', () => {
    const { scene, layer } = groupedSpline()
    expect(resolveSplineMoveBounds(layer, scene, 0)).toBeNull()
  })
})

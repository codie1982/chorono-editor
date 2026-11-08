import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromPrimitive } from '@/lib/defaults'
import { createCircleSpline } from '../primitives/createCircleSpline'
import { createPolylineSpline } from './createPolylineSpline'
import { placeSplineInLayer } from './placeSplineInLayer'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { transformSplineData } from '../geometry/transformSplineData'

describe('placeSplineInLayer', () => {
  const makeFixture = () => {
    const scene = emptyScene()
    const parent = newSplineLayerFromPrimitive('rectangle', { width: 100, height: 60 })!
    parent.type = 'group'
    parent.transform = { x: 150, y: 20, anchorX: 10, anchorY: 20, rotationDeg: 40, scaleX: 1.5, scaleY: 0.7 }
    const layer = newSplineLayerFromPrimitive('circle', { radius: 60 })!
    layer.parentId = parent.id
    layer.transform = { x: 50, y: 30, anchorX: -10, anchorY: 5, rotationDeg: -30, scaleX: -2, scaleY: 3 }
    scene.layers = [parent, layer]
    return { scene, layer }
  }

  it('preserves a drawn circle in composition space when appended to a transformed child', () => {
    const { scene, layer } = makeFixture()
    const circle = createCircleSpline({ radius: 30 })
    const placed = placeSplineInLayer(circle, 360, 140, layer, scene)!
    const rendered = transformSplineData(placed, resolveLayerWorldMatrix(layer, scene))
    for (const original of [...Object.values(circle.points), ...Object.values(circle.handles)]) {
      const actual = rendered.points[original.id] ?? rendered.handles[original.id]
      expect(actual.x).toBeCloseTo(original.x + 360, 8)
      expect(actual.y).toBeCloseTo(original.y + 140, 8)
    }
    expect(placed.contours).toBe(circle.contours)
  })

  it('places drawn line anchors and quadratic controls using the displayed transform', () => {
    const { scene, layer } = makeFixture()
    const data = createPolylineSpline([{ x: -40, y: -10 }, { x: 0, y: 20 }, { x: 40, y: 10 }], false)
    const segment = Object.values(data.segments)[0]
    data.segments[segment.id] = { ...segment, type: 'quadratic', control1: { x: -30, y: -40 } }
    const overrides = new Map([[`layers.${layer.id}.transform.rotationDeg`, 75]])
    const placed = placeSplineInLayer(data, 420, 210, layer, scene, 1000, overrides)!
    const rendered = transformSplineData(placed, resolveLayerWorldMatrix(layer, scene, 1000, overrides))
    for (const point of Object.values(data.points)) {
      expect(rendered.points[point.id].x).toBeCloseTo(point.x + 420, 8)
      expect(rendered.points[point.id].y).toBeCloseTo(point.y + 210, 8)
    }
    expect(rendered.segments[segment.id].control1!.x).toBeCloseTo(390, 8)
    expect(rendered.segments[segment.id].control1!.y).toBeCloseTo(170, 8)
    expect(data.segments[segment.id].control1).toEqual({ x: -30, y: -40 })
  })

  it('declines append to a zero-scale target instead of introducing infinities', () => {
    const { scene, layer } = makeFixture()
    layer.transform.scaleX = 0
    expect(placeSplineInLayer(createCircleSpline({ radius: 10 }), 40, 50, layer, scene)).toBeNull()
  })
})

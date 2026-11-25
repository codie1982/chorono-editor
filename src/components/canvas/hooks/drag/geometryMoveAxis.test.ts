import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '@/lib/defaults'
import { createCircleSpline } from '@/lib/spline'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { previewGeometryDrag } from './geometryDragPreview'

/** Axis constraints are composition axes even under rotated, nonuniform parents. */
describe('Edit geometry move axes', () => {
  it.each(['x', 'y', null] as const)('constrains %s before converting to local geometry and keeps object placement', axisLock => {
    const parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
    parent.transform = { ...parent.transform, rotationDeg: 31, scaleX: 1.7, scaleY: .8 }
    const layer = newSplineLayerFromData(createCircleSpline({ radius: 40 })); layer.parentId = parent.id
    const base = { ...emptyScene(), layers: [parent, layer] }, matrix = resolveLayerWorldMatrix(layer, base)
    const point = Object.values(layer.spline!.points)[0], before = matrix.applyToPoint(point)
    const preview = previewGeometryDrag({ base, drag: { kind: 'splineGeometry', layerId: layer.id, originalLayer: layer,
      pointIds: [point.id], operation: 'move', axisLock, startLocal: point, pivot: point,
      startClientX: 0, startClientY: 0, worldToLocal: matrix.invert() },
      event: { pointerId: 1, clientX: 30, clientY: 12, metaKey: false, ctrlKey: false, shiftKey: true },
      delta: { x: 30, y: 12 }, snap: { grid: false, pixel: false, size: 10 } })
    const next = preview.scene.layers[1], after = matrix.applyToPoint(next.spline!.points[point.id])
    expect(after.x - before.x).toBeCloseTo(axisLock === 'y' ? 0 : 30, 8)
    expect(after.y - before.y).toBeCloseTo(axisLock === 'y' ? 12 : 0, 8)
    expect(next.transform).toBe(layer.transform)
    expect(next.spline!.points[Object.keys(layer.spline!.points)[1]]).toBe(layer.spline!.points[Object.keys(layer.spline!.points)[1]])
  })
})

it.each(['scene', 'local', 'vertex'] as const)('snaps a dragged point in the %s frame', (space) => {
  const layer = newSplineLayerFromData(createCircleSpline({ radius: 27 }))
  layer.transform = { ...layer.transform, x: 19, y: 11, rotationDeg: 38 }
  const base = { ...emptyScene(), layers: [layer] },
    world = resolveLayerWorldMatrix(layer, base)
  const point = Object.values(layer.spline!.points)[0],
    start = world.applyToPoint(point)
  const target =
    space === 'local' ? world.applyToPoint({ x: 30, y: 20 }) : space === 'scene' ? { x: 40, y: 30 } : { x: 37, y: 29 }
  const preview = previewGeometryDrag({
    base,
    drag: {
      kind: 'splineGeometry',
      layerId: layer.id,
      originalLayer: layer,
      pointIds: [point.id],
      operation: 'move',
      pivot: point,
      startLocal: point,
      worldToLocal: world.invert(),
      startClientX: 0,
      startClientY: 0,
    },
    delta: { x: target.x + 1 - start.x, y: target.y - 1 - start.y },
    event: { pointerId: 1, clientX: 0, clientY: 0, shiftKey: false, ctrlKey: false, metaKey: false },
    snap: { grid: true, pixel: false, size: 10 },
    componentSpace: space === 'local' ? 'local' : 'scene',
    snapRadiusWorld: 4,
    componentVertices: space === 'vertex' ? [{ ...target, layerId: 'other', pointId: 'v', openEndpoint: false }] : [],
  })
  const actual = world.applyToPoint(preview.scene.layers[0].spline!.points[point.id])
  expect(actual.x).toBeCloseTo(target.x, 8)
  expect(actual.y).toBeCloseTo(target.y, 8)
})

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

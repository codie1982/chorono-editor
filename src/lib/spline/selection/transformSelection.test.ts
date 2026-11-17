import { describe, expect, it } from 'vitest'
import { createDonutSpline, createRectangleSpline, createPolylineSpline, mergeSplineData } from '../index'
import { Matrix2D } from '../../geometry/Matrix2D'
import { splineSelectionPoints, transformSplineSelection } from './transformSelection'
import { appendSplineObjects } from '../creation/appendSplineObjects'
import { shouldAutoClose } from '../creation/autoClose'
import { emptyScene, newSplineLayerFromData } from '../../defaults'
import { splineDrawingCommand } from '@/components/splineEdit/drawing/drawingCommand'
import { splineEditCommand } from '@/components/splineEdit/commands'
import { previewGeometryDrag } from '@/components/canvas/hooks/drag/geometryDragPreview'

function fixture() {
  const rectangle = createRectangleSpline({ width: 100, height: 60 }), donut = createDonutSpline({ outerRadius: 60, innerRadius: 25 })
  const data = mergeSplineData(rectangle, donut), scene = emptyScene(), layer = newSplineLayerFromData(data, { name: 'Compound', x: 120, y: 90 })
  scene.layers = [layer]; return { rectangle, donut, data, scene, layer }
}
describe('S2D-1 source geometry and ownership', () => {
  it('transforms every donut contour/handle once, preserving topology and other objects', () => {
    const { data, rectangle, donut } = fixture(), before = structuredClone(data)
    const ids = splineSelectionPoints(data, 'object', Object.keys(donut.subShapes))
    const next = transformSplineSelection(data, ids, { x: 10, y: 20, rotation: 90, scaleX: 2, scaleY: .5 })
    const matrix = Matrix2D.translation(10, 20).rotate(90).scale(2, .5)
    for (const point of Object.values(donut.points)) {
      expect(next.points[point.id].x).toBeCloseTo(matrix.applyToPoint(point).x)
      expect(next.points[point.id].y).toBeCloseTo(matrix.applyToPoint(point).y)
    }
    for (const handle of Object.values(donut.handles)) expect(next.handles[handle.id].x).toBeCloseTo(matrix.applyToPoint(handle).x)
    for (const id of Object.keys(rectangle.points)) expect(next.points[id]).toBe(data.points[id])
    expect(next.contours).toBe(data.contours); expect(data).toEqual(before)
  })
  it('deduplicates adjacent edge endpoints and transforms explicit quadratic controls', () => {
    const { data, rectangle } = fixture(), edges = Object.values(rectangle.segments).slice(0, 2)
    const ids = splineSelectionPoints(data, 'edge', edges.map(edge => edge.id)); expect(ids.size).toBe(3)
    data.segments[edges[0].id] = { ...edges[0], type: 'quadratic', control1: { x: 10, y: 15 } }
    const next = transformSplineSelection(data, ids, { x: 7 })
    for (const id of Array.from(ids)) expect(next.points[id].x).toBe(data.points[id].x + 7)
    expect(next.segments[edges[0].id].control1).toEqual({ x: 17, y: 15 })
    expect(transformSplineSelection(data, ids, {})).toBe(data)
    expect(() => transformSplineSelection(data, ids, { scaleX: 0 })).toThrow('positive')
  })
  it('appends only fresh IDs and distinct names without changing old records', () => {
    const first = createRectangleSpline({ width: 60, height: 40 }), second = createRectangleSpline({ width: 80, height: 70 })
    const append = appendSplineObjects(first, second)
    expect(append.objectIds).toEqual(Object.keys(second.subShapes))
    expect(Object.values(append.data.subShapes).map(object => object.name)).toEqual(['Rectangle', 'Rectangle 2'])
    for (const id of Object.keys(first.points)) expect(append.data.points[id]).toBe(first.points[id])
    expect(() => appendSplineObjects(first, first)).toThrow('overlap')
  })
  it('samples closure in CSS px and requires three anchors without welding', () => {
    const points = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]
    expect(shouldAutoClose(points, points[0], { x: 15, y: 0 }, .5)).toBe(true)
    expect(shouldAutoClose(points, points[0], { x: 15, y: 0 }, 1)).toBe(false)
    expect(shouldAutoClose(points.slice(0, 2), points[0], points[0], 1)).toBe(false)
    expect(shouldAutoClose(points.slice(0, 2), points[0], points[0], 1, 1)).toBe(true)
  })
  it('adds in displayed parent space with one undo and keeps human keys/style', () => {
    const { scene, layer } = fixture(); layer.transform.rotationDeg = 30; layer.transform.scaleX = 1.7
    scene.timelines = [{ id: 'main', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: `layers.${layer.id}.transform.x`, keyframes: [{ id: 'human', timeMs: 0, value: 150, easing: { type: 'linear' } }] }] }]
    const before = structuredClone(scene), incoming = createRectangleSpline({ width: 20, height: 10 })
    const prepared = splineDrawingCommand(scene, layer.id, incoming, { x: 250, y: 100 }, false, 'Added', 0)
    const next = prepared.command!.execute(scene)
    expect(next.layers).toHaveLength(1); expect(Object.keys(next.layers[0].spline!.subShapes)).toHaveLength(3)
    expect(next.layers[0].style).toEqual(layer.style); expect(next.layers[0].transform).toEqual(layer.transform); expect(next.timelines).toEqual(scene.timelines)
    expect(prepared.command!.undo(next)).toEqual(before); expect(scene).toEqual(before)
  })
  it('continues only the explicit endpoint, preserving old curves, IDs and tracks', () => {
    const data = createPolylineSpline([{ x: 0, y: 0 }, { x: 20, y: 0 }], false), scene = emptyScene()
    const layer = newSplineLayerFromData(data, { name: 'Open', x: 0, y: 0 }); scene.layers = [layer]
    const contour = Object.values(data.contours)[0], endpoint = contour.pointIds.at(-1)!
    const incoming = createPolylineSpline([{ x: 20, y: 0 }, { x: 40, y: 30 }], false)
    const prepared = splineDrawingCommand(scene, layer.id, incoming, { x: 0, y: 0 }, true, 'Continue', 0, undefined, endpoint)
    const next = prepared.command!.execute(scene), result = next.layers[0].spline!
    expect(Object.keys(result.subShapes)).toEqual(Object.keys(data.subShapes)); expect(result.contours[contour.id].pointIds).toHaveLength(3)
    expect(result.segments[contour.segmentIds[0]]).toBe(data.segments[contour.segmentIds[0]])
    expect(prepared.result.ids).toEqual([result.contours[contour.id].pointIds.at(-1)])
    expect(prepared.command!.undo(next)).toEqual(scene)
  })
  it('can close an existing three-anchor continued contour without adding a duplicate point', () => {
    const data = createPolylineSpline([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }], false), scene = emptyScene()
    const layer = newSplineLayerFromData(data, { name: 'Open', x: 0, y: 0 }); scene.layers = [layer]
    const contour = Object.values(data.contours)[0], endpoint = contour.pointIds.at(-1)!
    const prepared = splineDrawingCommand(scene, layer.id, createPolylineSpline([{ x: 20, y: 20 }], false), { x: 0, y: 0 }, false, 'Close', 0, undefined, endpoint, true)
    const next = prepared.command!.execute(scene).layers[0].spline!
    expect(next.contours[contour.id].closed).toBe(true); expect(next.contours[contour.id].pointIds).toEqual(contour.pointIds)
    expect(Object.keys(next.points)).toEqual(Object.keys(data.points)); expect(next.contours[contour.id].segmentIds).toHaveLength(3)
  })
  it('refuses driven/locked participating geometry while unrelated animated objects survive', () => {
    const { scene, layer, rectangle, donut, data } = fixture(), point = Object.keys(rectangle.points)[0]
    scene.timelines = [{ id: 'main', durationMs: 100, autoplay: false, loop: false, tracks: [{ target: `layers.${layer.id}.spline.points.${point}.x`, keyframes: [{ id: 'manual', timeMs: 0, value: 5, easing: { type: 'linear' } }] }] }]
    const apply = (points: Set<string>) => splineEditCommand(scene, layer.id, { kind: 'geometry', ids: Array.from(points) }, source => transformSplineSelection(source, points, { x: 10 }))
    expect(() => apply(splineSelectionPoints(data, 'object', Object.keys(rectangle.subShapes)))).toThrow()
    const next = apply(splineSelectionPoints(data, 'object', Object.keys(donut.subShapes)))!.execute(scene)
    expect(next.timelines).toEqual(scene.timelines); expect(next.layers[0].spline!.points[point]).toBe(data.points[point])
    Object.values(donut.points)[0].locked = true
    expect(() => apply(splineSelectionPoints(data, 'object', Object.keys(donut.subShapes)))).toThrow('Unlock')
  })
  it('computes move/rotate/scale from immutable pointer baselines, leaving layer transform unchanged', () => {
    const { scene, layer, rectangle } = fixture(), ids = Object.keys(rectangle.points)
    for (const operation of ['move', 'rotate', 'scale'] as const) {
      const preview = previewGeometryDrag({ base: scene, drag: { kind: 'splineGeometry', layerId: layer.id, originalLayer: layer, pointIds: ids, operation,
        startClientX: 0, startClientY: 0, startLocal: { x: 50, y: 0 }, pivot: { x: 0, y: 0 }, worldToLocal: Matrix2D.identity() },
        delta: operation === 'rotate' ? { x: -50, y: 50 } : { x: 50, y: 0 }, event: { pointerId: 1, clientX: 50, clientY: 0, shiftKey: false, metaKey: false, ctrlKey: false }, snap: { grid: false, pixel: false, size: 20 } })
      expect(preview.changes).toHaveLength(1); expect(preview.changes[0].next.transform).toEqual(layer.transform)
      expect(preview.changes[0].changedProperties).toEqual(['spline'])
    }
  })
})

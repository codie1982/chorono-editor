import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '@/lib/defaults'
import { createCircleSpline, createPolylineSpline, mergeSplineData } from '@/lib/spline'
import { assertSplineTopology, deleteSplineEdges } from '@/lib/spline/topology'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { splineDrawingCommand } from './drawingCommand'

/** Two cut circular contours under a keyed, rotated/nonuniform parent. */
function fixture() {
  const arc = (radius: number) => { const data = createCircleSpline({ radius }); return deleteSplineEdges(data, [Object.keys(data.segments)[0]]) }
  const data = mergeSplineData(arc(100), arc(70)), scene = emptyScene()
  const parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
  parent.transform = { ...parent.transform, x: 180, y: 130, rotationDeg: 20, scaleX: 1.2, scaleY: .8 }
  const layer = newSplineLayerFromData(data, { x: 0, y: 0 }); layer.parentId = parent.id
  scene.layers = [parent, layer]
  scene.timelines = [{ id: 'main', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: 'layers.parent.transform.x', keyframes: [{ id: 'human-key', timeMs: 0, value: 220, easing: { type: 'linear' } }] }] }]
  return { scene, layer, data }
}

describe('drawn open endpoint connections', () => {
  it('bridges two arcs then closes the remaining ends without duplicate points, retaining curves/keys and one undo per action', () => {
    const { scene, layer, data } = fixture(), before = structuredClone(scene), contours = Object.values(data.contours)
    const start = contours[0].pointIds.at(-1)!, end = contours[1].pointIds[0]
    const world = resolveLayerWorldMatrix(layer, scene, 0).applyToPoint(data.points[start])
    const command = splineDrawingCommand(scene, layer.id, createPolylineSpline([{ x: 0, y: 0 }], false), world, true, 'Join', 0, undefined, start, false, end).command!
    const next = command.execute(scene), connected = next.layers[1].spline!
    assertSplineTopology(connected)
    expect(Object.keys(connected.points)).toEqual(Object.keys(data.points)); expect(Object.keys(connected.subShapes)).toHaveLength(1)
    expect(Object.values(connected.contours)).toHaveLength(1); expect(Object.keys(connected.segments)).toHaveLength(7)
    for (const id of Object.keys(data.segments)) expect(connected.segments[id]).toBe(data.segments[id])
    expect(connected.handles).toEqual(data.handles); expect(next.timelines).toBe(scene.timelines)
    expect(command.undo(next)).toEqual(before)
    const remaining = Object.values(connected.contours)[0], a = remaining.pointIds.at(-1)!, b = remaining.pointIds[0]
    const position = resolveLayerWorldMatrix(next.layers[1], next, 0).applyToPoint(connected.points[a])
    const close = splineDrawingCommand(next, layer.id, createPolylineSpline([{ x: 0, y: 0 }], false), position, false, 'Close', 0, undefined, a, false, b).command!
    const final = close.execute(next); assertSplineTopology(final.layers[1].spline!)
    expect(Object.values(final.layers[1].spline!.contours)[0].closed).toBe(true)
    expect(Object.keys(final.layers[1].spline!.points)).toHaveLength(8); expect(final.timelines).toEqual(scene.timelines)
    expect(close.undo(final)).toEqual(next); expect(scene).toEqual(before)
  })
  it('keeps intermediate drawn positions in displayed parent space and rejects driven/locked/stale joins atomically', () => {
    const { scene, layer, data } = fixture(), contours = Object.values(data.contours)
    const start = contours[0].pointIds.at(-1)!, end = contours[1].pointIds[0]
    const matrix = resolveLayerWorldMatrix(layer, scene, 0), points = [data.points[start], { x: 20, y: 35 }].map(point => matrix.applyToPoint(point))
    const prepare = () => splineDrawingCommand(scene, layer.id, createPolylineSpline(points, false), { x: 0, y: 0 }, true, 'Join', 0, undefined, start, false, end)
    const prepared = prepare(), next = prepared.command!.execute(scene)
    const added = Object.values(next.layers[1].spline!.points).filter(point => !data.points[point.id])
    expect(added).toHaveLength(1); expect(added[0].x).toBeCloseTo(20); expect(added[0].y).toBeCloseTo(35)
    expect(() => prepared.command!.execute({ ...scene, layers: [scene.layers[0], { ...layer, spline: structuredClone(data) }] })).toThrow('changed')
    scene.timelines[0].tracks.push({ target: `layers.${layer.id}.spline.points.${start}.x`, keyframes: [{ id: 'manual-point', timeMs: 0, value: 2, easing: { type: 'linear' } }] })
    expect(() => prepare()).toThrow(/keyed|driven|animated|timeline/i)
    scene.timelines[0].tracks.pop(); data.points[end].locked = true
    expect(() => prepare()).toThrow(/unlock|unlocked/i)
    expect(() => splineDrawingCommand(scene, layer.id, createPolylineSpline(points, false), { x: 0, y: 0 }, false, 'Join', 0, undefined, start, false, start)).toThrow('different')
  })
})

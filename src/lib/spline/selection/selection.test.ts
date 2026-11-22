import { describe, expect, it } from 'vitest'
import { createRectangleSpline, createDonutSpline, createCircleSpline, createLineSpline, mergeSplineData, translateSplineData, transformSplineData } from '../index'
import { Matrix2D } from '../../geometry'
import { emptySplineSelection, pruneSplineSelection, selectSplineIds, pickSplineElement, splineIdsInRegion, splineEdgePath } from './index'
import { moveSplinePoints } from '../edit/moveSplinePoints'
import { PathSampler } from '../../path/PathSampler'

const rectangle = () => createRectangleSpline({ width: 100, height: 60 })
describe('transient spline sub-object selection', () => {
  it('maintains distinct mode banks, stable toggles and immutable source', () => {
    const data = rectangle(), before = structuredClone(data), points = Object.keys(data.points), edge = Object.keys(data.segments)[0]
    const bank = selectSplineIds(emptySplineSelection(), 'point', [points[0], points[0]], 'replace')
    const multi = selectSplineIds(bank, 'point', [points[1]], 'add')
    const other = selectSplineIds(multi, 'edge', [edge], 'replace')
    expect(bank.point).toEqual([points[0]]); expect(other.point).toEqual(points.slice(0, 2)); expect(other.edge).toEqual([edge])
    expect(selectSplineIds(other, 'point', [points[0]], 'toggle').point).toEqual([points[1]])
    expect(selectSplineIds(other, 'point', [points[1]], 'subtract').point).toEqual([points[0]])
    expect(data).toEqual(before)
  })
  it('prunes unknown/removed IDs without selecting replacements', () => {
    const data = rectangle(), id = Object.keys(data.points)[0], bank = { point: [id, 'stale', id], edge: ['bad'], object: Object.keys(data.subShapes) }
    expect(pruneSplineSelection(bank, data)).toEqual({ point: [id], edge: [], object: bank.object })
    expect(pruneSplineSelection(pruneSplineSelection(bank, data), data).point).toEqual([id])
    expect(pruneSplineSelection(bank)).toEqual(emptySplineSelection())
  })
  it('isolates point/edge/object hit semantics and compound donut holes', () => {
    const ring = createDonutSpline({ outerRadius: 80, innerRadius: 40 }), object = Object.keys(ring.subShapes)[0]
    expect(pickSplineElement(ring, 'object', 60, 0, 2)).toEqual({ kind: 'object', id: object })
    expect(pickSplineElement(ring, 'object', 0, 0, 2)).toBeNull()
    expect(pickSplineElement(ring, 'point', 60, 0, 2)).toBeNull()
    expect(pickSplineElement(ring, 'edge', 80, 0, 2)?.kind).toBe('edge')
    const line = createLineSpline({ x1: -30, y1: 0, x2: 30, y2: 0 })
    expect(pickSplineElement(line, 'object', 0, 0, 2)?.id).toBe(Object.keys(line.subShapes)[0])
  })
  it('picks the displayed world geometry under skewing parent scale/rotation', () => {
    const data = rectangle(), transform = Matrix2D.translation(200, 150).rotate(37).scale(1.7, .6), world = transformSplineData(data, transform)
    const point = Object.values(data.points)[0], displayed = transform.applyToPoint(point)
    expect(pickSplineElement(world, 'point', displayed.x + 1, displayed.y, 3)).toEqual({ kind: 'point', id: point.id })
    expect(pickSplineElement(data, 'point', displayed.x, displayed.y, 3)).toBeNull()
  })
  it('supports every region style and distinguishes inside from touching edges', () => {
    const data = rectangle(), top = Object.keys(data.segments)[0]
    expect(splineIdsInRegion(data, 'point', { kind: 'box', x: -51, y: -31, w: 2, h: 2 }, 'inside').size).toBe(1)
    expect(splineIdsInRegion(data, 'edge', { kind: 'box', x: -2, y: -32, w: 4, h: 4 }, 'touching').has(top)).toBe(true)
    expect(splineIdsInRegion(data, 'edge', { kind: 'box', x: -2, y: -32, w: 4, h: 4 }, 'inside').size).toBe(0)
    expect(splineIdsInRegion(data, 'point', { kind: 'circle', cx: -50, cy: -30, r: 2 }, 'touching').size).toBe(1)
    expect(splineIdsInRegion(data, 'point', { kind: 'paint', cx: -50, cy: -30, r: 2 }, 'inside').size).toBe(1)
    expect(splineIdsInRegion(data, 'object', { kind: 'lasso', points: [{ x: -60, y: -40 }, { x: 60, y: -40 }, { x: 60, y: 40 }, { x: -60, y: 40 }] }, 'inside').size).toBe(1)
  })
  it('selects each whole SubShape and never fabricates an edge through its hole', () => {
    const ring = createDonutSpline({ outerRadius: 80, innerRadius: 40 }), ringId = Object.keys(ring.subShapes)[0]
    const compound = mergeSplineData(ring, translateSplineData(rectangle(), 240, 0))
    expect(splineIdsInRegion(compound, 'object', { kind: 'box', x: -5, y: -5, w: 10, h: 10 }, 'touching').size).toBe(0)
    expect(splineIdsInRegion(compound, 'object', { kind: 'box', x: 55, y: -5, w: 10, h: 10 }, 'touching')).toEqual(new Set([ringId]))
    expect(splineIdsInRegion(compound, 'object', { kind: 'box', x: -90, y: -90, w: 180, h: 180 }, 'inside')).toEqual(new Set([ringId]))
  })
  it('uses canonical cubic handles for edge paths and multi-point translation once', () => {
    const data = createCircleSpline({ radius: 70 }), ids = Object.keys(data.points).slice(0, 2), original = structuredClone(data)
    expect(new PathSampler().buildLengthTable(splineEdgePath(data, Object.keys(data.segments)[0])).totalLength).toBeGreaterThan(100)
    const moved = moveSplinePoints(data, [ids[0], ids[1], ids[0]], 10, -3)
    for (const id of ids) { expect(moved.points[id].x).toBe(data.points[id].x + 10); expect(moved.points[id].y).toBe(data.points[id].y - 3) }
    for (const handle of Object.values(data.handles)) expect(moved.handles[handle.id].x).toBe(handle.x + (ids.includes(handle.pointId) ? 10 : 0))
    expect(moved.segments).toBe(data.segments); expect(data).toEqual(original)
  })
  it('translates an edge-owned quadratic control only when both anchors move', () => {
    const data = createLineSpline({ x1: 0, y1: 0, x2: 100, y2: 0 }), edge = Object.values(data.segments)[0]
    edge.type = 'quadratic'; edge.control1 = { x: 30, y: -40 }
    const both = moveSplinePoints(data, [edge.fromPointId, edge.toPointId], 10, 20)
    expect(both.segments[edge.id].control1).toEqual({ x: 40, y: -20 })
    expect(moveSplinePoints(data, [edge.fromPointId], 10, 20).segments).toBe(data.segments)
    expect(data.segments[edge.id].control1).toEqual({ x: 30, y: -40 })
  })

})

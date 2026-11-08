import { describe, it, expect } from 'vitest'
import { createCircleSpline } from '../primitives/createCircleSpline'
import { createRectangleSpline } from '../primitives/createRectangleSpline'
import { createLineSpline } from '../primitives/createLineSpline'
import {
  moveSplinePoint, moveSplineHandle, insertPointOnSegment, deleteSplinePoint,
  setSplinePointType, setSegmentType, setContourClosed, reverseContour,
} from './mutations'

/** Evaluate a cubic at t (component-wise). */
function cubic(p0: number, c1: number, c2: number, p1: number, t: number): number {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * p1
}

describe('spline mutations', () => {
  it('moveSplinePoint translates the point and its handles', () => {
    const c = createCircleSpline({ radius: 50 })
    const pid = Object.keys(c.points)[0]
    const p0 = c.points[pid]
    const before = Object.values(c.handles).filter(h => h.pointId === pid).map(h => ({ x: h.x, y: h.y }))
    const next = moveSplinePoint(c, pid, p0.x + 10, p0.y + 20)
    expect(next.points[pid].x).toBeCloseTo(p0.x + 10)
    expect(next.points[pid].y).toBeCloseTo(p0.y + 20)
    const after = Object.values(next.handles).filter(h => h.pointId === pid).map(h => ({ x: h.x, y: h.y }))
    after.forEach((h, i) => {
      expect(h.x).toBeCloseTo(before[i].x + 10)
      expect(h.y).toBeCloseTo(before[i].y + 20)
    })
  })

  it('moveSplineHandle mirrors the opposite handle for bezier points', () => {
    const c = createCircleSpline({ radius: 50 }) // circle points are type 'bezier'
    const pid = Object.keys(c.points)[0]
    const p = c.points[pid]
    const next = moveSplineHandle(c, pid, 'out', p.x + 15, p.y + 5)
    const inH  = Object.values(next.handles).find(h => h.pointId === pid && h.kind === 'in')!
    // mirror: in = P - (out - P)
    expect(inH.x).toBeCloseTo(p.x - 15)
    expect(inH.y).toBeCloseTo(p.y - 5)
  })

  it('insertPointOnSegment(cubic) places the new point ON the original curve', () => {
    const c = createCircleSpline({ radius: 80 })
    const seg = Object.values(c.segments)[0]
    const from = c.points[seg.fromPointId], to = c.points[seg.toPointId]
    const outH = Object.values(c.handles).find(h => h.pointId === from.id && h.kind === 'out')!
    const inH  = Object.values(c.handles).find(h => h.pointId === to.id   && h.kind === 'in')!
    const expectedX = cubic(from.x, outH.x, inH.x, to.x, 0.5)
    const expectedY = cubic(from.y, outH.y, inH.y, to.y, 0.5)

    const before = Object.keys(c.points).length
    const next = insertPointOnSegment(c, seg.id, 0.5)
    expect(Object.keys(next.points).length).toBe(before + 1)
    // The inserted point must lie on the original curve (curve unchanged).
    const newPt = Object.values(next.points).find(p => !c.points[p.id])!
    expect(newPt.x).toBeCloseTo(expectedX, 4)
    expect(newPt.y).toBeCloseTo(expectedY, 4)
  })

  it('insertPointOnSegment(line) splits at the midpoint', () => {
    const line = createLineSpline({ x1: 0, y1: 0, x2: 100, y2: 0 })
    const seg = Object.values(line.segments)[0]
    const next = insertPointOnSegment(line, seg.id, 0.5)
    const newPt = Object.values(next.points).find(p => !line.points[p.id])!
    expect(newPt.x).toBeCloseTo(50)
    expect(newPt.y).toBeCloseTo(0)
    expect(Object.keys(next.segments).length).toBe(2)
  })

  it('insertPointOnSegment(quadratic) preserves both halves of the curve', () => {
    const line = createLineSpline({ x1: 0, y1: 0, x2: 100, y2: 0 })
    const seg = Object.values(line.segments)[0]
    line.segments[seg.id] = { ...seg, type: 'quadratic', control1: { x: 30, y: 80 } }
    const next = insertPointOnSegment(line, seg.id, 0.4)
    const contour = Object.values(next.contours)[0]
    const halves = contour.segmentIds.map(id => next.segments[id])
    const q = (a: number, b: number, c: number, t: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c

    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const half = halves[t <= 0.4 ? 0 : 1]
      const u = t <= 0.4 ? t / 0.4 : (t - 0.4) / 0.6
      const from = next.points[half.fromPointId], to = next.points[half.toPointId]
      expect(half.type).toBe('quadratic')
      expect(q(from.x, half.control1!.x, to.x, u)).toBeCloseTo(q(0, 30, 100, t), 8)
      expect(q(from.y, half.control1!.y, to.y, u)).toBeCloseTo(q(0, 80, 0, t), 8)
    }
    expect(line.segments[seg.id].control1).toEqual({ x: 30, y: 80 })
  })

  it('does not insert degenerate or non-finite split points', () => {
    const line = createLineSpline({ x1: 0, y1: 0, x2: 100, y2: 0 })
    const seg = Object.values(line.segments)[0]
    for (const t of [0, 1, -0.5, 1.5, NaN, Infinity]) {
      expect(insertPointOnSegment(line, seg.id, t)).toBe(line)
    }
  })

  it('deleteSplinePoint removes the point and merges segments', () => {
    const r = createRectangleSpline({ width: 100, height: 60, cornerMode: 'sharp' }) // 4 pts, 4 segs
    const pid = Object.keys(r.points)[0]
    const next = deleteSplinePoint(r, pid)
    expect(Object.keys(next.points).length).toBe(3)
    expect(next.points[pid]).toBeUndefined()
    const contour = Object.values(next.contours)[0]
    expect(contour.pointIds).not.toContain(pid)
  })

  it('setContourClosed toggles the closing segment', () => {
    const r = createRectangleSpline({ width: 80, height: 80, cornerMode: 'sharp' })
    const cid = Object.keys(r.contours)[0]
    const segCount = Object.keys(r.segments).length
    const opened = setContourClosed(r, cid, false)
    expect(opened.contours[cid].closed).toBe(false)
    expect(Object.keys(opened.segments).length).toBe(segCount - 1)
    const reclosed = setContourClosed(opened, cid, true)
    expect(reclosed.contours[cid].closed).toBe(true)
    expect(Object.keys(reclosed.segments).length).toBe(segCount)
  })

  it('reverseContour reverses point order and swaps handle kinds', () => {
    const c = createCircleSpline({ radius: 40 })
    const cid = Object.keys(c.contours)[0]
    const orig = [...c.contours[cid].pointIds]
    const next = reverseContour(c, cid)
    expect(next.contours[cid].pointIds).toEqual([...orig].reverse())
    const contour = next.contours[cid]
    contour.segmentIds.forEach((sid, i) => {
      const seg = next.segments[sid]
      expect(seg.fromPointId).toBe(contour.pointIds[i])
      expect(seg.toPointId).toBe(contour.pointIds[(i + 1) % contour.pointIds.length])
    })
    const restored = reverseContour(next, cid)
    expect(restored.contours[cid]).toEqual(c.contours[cid])
    expect(restored.handles).toEqual(c.handles)
    expect(restored.segments).toEqual(c.segments)
  })

  it('reverses a quadratic using the same control point', () => {
    const line = createLineSpline({ x1: 0, y1: 0, x2: 100, y2: 0 })
    const seg = Object.values(line.segments)[0]
    line.segments[seg.id] = { ...seg, type: 'quadratic', control1: { x: 30, y: 80 } }
    const cid = Object.keys(line.contours)[0]
    const next = reverseContour(line, cid)
    expect(next.segments[seg.id]).toEqual({
      ...line.segments[seg.id], fromPointId: seg.toPointId, toPointId: seg.fromPointId,
    })
    expect(reverseContour(next, cid)).toEqual(line)
  })

  it('setSegmentType line→cubic creates handles', () => {
    const line = createLineSpline({ x1: 0, y1: 0, x2: 90, y2: 0 })
    const seg = Object.values(line.segments)[0]
    const next = setSegmentType(line, seg.id, 'cubic')
    expect(next.segments[seg.id].type).toBe('cubic')
    expect(Object.keys(next.handles).length).toBeGreaterThan(0)
  })

  it('setSplinePointType corner removes handles', () => {
    const c = createCircleSpline({ radius: 40 })
    const pid = Object.keys(c.points)[0]
    const next = setSplinePointType(c, pid, 'corner')
    expect(Object.values(next.handles).some(h => h.pointId === pid)).toBe(false)
    expect(next.points[pid].type).toBe('corner')
  })
})

// ── Spline edit mutations (BL-73 Sprint 4) ────────────────────────────────────
//
// Pure transforms on SplinePathData. Each returns a fresh object (no mutation),
// so they compose with the editor's command/undo system.
//
// Handles are canonical for cubic segments: a cubic A→B reads A's 'out' handle
// and B's 'in' handle. Point continuity (smooth/bezier) is enforced when a
// handle moves.

import type {
  SplinePathData, SplinePoint, SplineHandle, SplineSegment, SplinePointType,
} from '@/lib/types/spline'
import { uid } from '../util/uid'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpPt = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) =>
  ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) })

function getHandle(data: SplinePathData, pointId: string, kind: 'in' | 'out'): SplineHandle | undefined {
  for (const h of Object.values(data.handles)) if (h.pointId === pointId && h.kind === kind) return h
  return undefined
}

// ── Move a point (its handles follow rigidly) ─────────────────────────────────

export function moveSplinePoint(data: SplinePathData, pointId: string, x: number, y: number): SplinePathData {
  const p = data.points[pointId]
  if (!p) return data
  const dx = x - p.x, dy = y - p.y
  const points = { ...data.points, [pointId]: { ...p, x, y } }
  const handles = { ...data.handles }
  for (const h of Object.values(data.handles)) {
    if (h.pointId === pointId) handles[h.id] = { ...h, x: h.x + dx, y: h.y + dy }
  }
  return { ...data, points, handles }
}

// ── Move a handle (enforce continuity for smooth / bezier points) ─────────────

export function moveSplineHandle(
  data: SplinePathData, pointId: string, kind: 'in' | 'out', x: number, y: number,
): SplinePathData {
  const p = data.points[pointId]
  const handle = getHandle(data, pointId, kind)
  if (!p || !handle) return data
  const handles = { ...data.handles, [handle.id]: { ...handle, x, y } }

  const opp = getHandle(data, pointId, kind === 'in' ? 'out' : 'in')
  if (opp && !opp.locked && (p.type === 'smooth' || p.type === 'bezier')) {
    const vx = x - p.x, vy = y - p.y
    if (p.type === 'bezier') {
      handles[opp.id] = { ...opp, x: p.x - vx, y: p.y - vy }            // mirror
    } else {
      const oppLen = Math.hypot(opp.x - p.x, opp.y - p.y)
      const vLen = Math.hypot(vx, vy) || 1
      handles[opp.id] = { ...opp, x: p.x - (vx / vLen) * oppLen, y: p.y - (vy / vLen) * oppLen }
    }
  }
  return { ...data, handles }
}

// ── Insert a point on a segment (De Casteljau split preserves the curve) ──────

export function insertPointOnSegment(data: SplinePathData, segmentId: string, t: number): SplinePathData {
  if (!Number.isFinite(t) || t <= 0 || t >= 1) return data
  const seg = data.segments[segmentId]
  if (!seg) return data
  const from = data.points[seg.fromPointId]
  const to   = data.points[seg.toPointId]
  if (!from || !to) return data
  const contour = Object.values(data.contours).find(c => c.segmentIds.includes(segmentId))
  if (!contour) return data

  const points   = { ...data.points }
  const handles  = { ...data.handles }
  const segments = { ...data.segments }
  const newPtId  = uid('pt')

  let newPt: SplinePoint
  let seg1: SplineSegment, seg2: SplineSegment

  if (seg.type === 'cubic') {
    const outH = getHandle(data, from.id, 'out')
    const inH  = getHandle(data, to.id, 'in')
    const c1 = outH ? { x: outH.x, y: outH.y } : { x: from.x, y: from.y }
    const c2 = inH  ? { x: inH.x,  y: inH.y  } : { x: to.x,   y: to.y }
    const p01   = lerpPt(from, c1, t)
    const p12   = lerpPt(c1, c2, t)
    const p23   = lerpPt(c2, to, t)
    const p012  = lerpPt(p01, p12, t)
    const p123  = lerpPt(p12, p23, t)
    const p0123 = lerpPt(p012, p123, t)

    // shrink the existing handles to the split tangents
    if (outH) handles[outH.id] = { ...outH, x: p01.x, y: p01.y }
    else { const id = uid('h'); handles[id] = { id, pointId: from.id, kind: 'out', x: p01.x, y: p01.y, locked: false } }
    if (inH)  handles[inH.id]  = { ...inH,  x: p23.x, y: p23.y }
    else { const id = uid('h'); handles[id] = { id, pointId: to.id, kind: 'in', x: p23.x, y: p23.y, locked: false } }

    newPt = { id: newPtId, x: p0123.x, y: p0123.y, type: 'smooth' }
    const nIn  = { id: uid('h'), pointId: newPtId, kind: 'in'  as const, x: p012.x, y: p012.y, locked: false }
    const nOut = { id: uid('h'), pointId: newPtId, kind: 'out' as const, x: p123.x, y: p123.y, locked: false }
    handles[nIn.id] = nIn; handles[nOut.id] = nOut
    seg1 = { id: uid('seg'), fromPointId: from.id, toPointId: newPtId, type: 'cubic' }
    seg2 = { id: uid('seg'), fromPointId: newPtId, toPointId: to.id,   type: 'cubic' }
  } else if (seg.type === 'quadratic') {
    const control = seg.control1 ?? from
    const p01 = lerpPt(from, control, t)
    const p12 = lerpPt(control, to, t)
    const mid = lerpPt(p01, p12, t)
    newPt = { id: newPtId, x: mid.x, y: mid.y, type: 'smooth' }
    seg1 = { id: uid('seg'), fromPointId: from.id, toPointId: newPtId, type: 'quadratic', control1: p01 }
    seg2 = { id: uid('seg'), fromPointId: newPtId, toPointId: to.id, type: 'quadratic', control1: p12 }
  } else {
    const mid = lerpPt(from, to, t)
    newPt = { id: newPtId, x: mid.x, y: mid.y, type: 'corner' }
    seg1 = { id: uid('seg'), fromPointId: from.id, toPointId: newPtId, type: 'line' }
    seg2 = { id: uid('seg'), fromPointId: newPtId, toPointId: to.id,   type: 'line' }
  }

  points[newPtId] = newPt
  delete segments[segmentId]
  segments[seg1.id] = seg1
  segments[seg2.id] = seg2

  const fromIdx = contour.pointIds.indexOf(from.id)
  const pointIds = [...contour.pointIds]
  pointIds.splice(fromIdx + 1, 0, newPtId)
  const segmentIds = [...contour.segmentIds]
  segmentIds.splice(contour.segmentIds.indexOf(segmentId), 1, seg1.id, seg2.id)

  return { ...data, points, handles, segments, contours: { ...data.contours, [contour.id]: { ...contour, pointIds, segmentIds } } }
}

// ── Delete a point (merge the two adjacent segments) ──────────────────────────

export function deleteSplinePoint(data: SplinePathData, pointId: string): SplinePathData {
  const contour = Object.values(data.contours).find(c => c.pointIds.includes(pointId))
  if (!contour || contour.pointIds.length <= 2) return data

  const points = { ...data.points }; delete points[pointId]
  const handles = { ...data.handles }
  for (const h of Object.values(data.handles)) if (h.pointId === pointId) delete handles[h.id]
  const segments = { ...data.segments }

  const inSegId  = contour.segmentIds.find(sid => segments[sid]?.toPointId   === pointId)
  const outSegId = contour.segmentIds.find(sid => segments[sid]?.fromPointId === pointId)
  let segmentIds = [...contour.segmentIds]

  if (inSegId && outSegId) {
    const prevId = segments[inSegId].fromPointId
    const nextId = segments[outSegId].toPointId
    const inPos = segmentIds.indexOf(inSegId)
    delete segments[inSegId]; delete segments[outSegId]
    const merged: SplineSegment = { id: uid('seg'), fromPointId: prevId, toPointId: nextId, type: 'line' }
    segments[merged.id] = merged
    segmentIds = segmentIds.filter(s => s !== inSegId && s !== outSegId)
    segmentIds.splice(Math.min(inPos, segmentIds.length), 0, merged.id)
  } else if (inSegId) {
    delete segments[inSegId];  segmentIds = segmentIds.filter(s => s !== inSegId)
  } else if (outSegId) {
    delete segments[outSegId]; segmentIds = segmentIds.filter(s => s !== outSegId)
  }

  const pointIds = contour.pointIds.filter(p => p !== pointId)
  return { ...data, points, handles, segments, contours: { ...data.contours, [contour.id]: { ...contour, pointIds, segmentIds } } }
}

// ── Convert a point's type (corner ⇄ smooth/bezier/bezierCorner) ──────────────

export function setSplinePointType(data: SplinePathData, pointId: string, type: SplinePointType): SplinePathData {
  const p = data.points[pointId]
  if (!p) return data
  const points = { ...data.points, [pointId]: { ...p, type } }
  const handles = { ...data.handles }

  if (type === 'corner') {
    for (const h of Object.values(data.handles)) if (h.pointId === pointId) delete handles[h.id]
    return { ...data, points, handles }
  }

  // ensure handles exist + adjacent segments are cubic so they take effect
  if (!getHandle(data, pointId, 'in') && !getHandle(data, pointId, 'out')) {
    const i = { id: uid('h'), pointId, kind: 'in'  as const, x: p.x - 30, y: p.y, locked: false }
    const o = { id: uid('h'), pointId, kind: 'out' as const, x: p.x + 30, y: p.y, locked: false }
    handles[i.id] = i; handles[o.id] = o
  }
  const segments = { ...data.segments }
  for (const s of Object.values(data.segments)) {
    if ((s.fromPointId === pointId || s.toPointId === pointId) && s.type === 'line') {
      segments[s.id] = { ...s, type: 'cubic' }
    }
  }
  return { ...data, points, handles, segments }
}

// ── Convert a segment line ⇄ cubic ────────────────────────────────────────────

export function setSegmentType(data: SplinePathData, segmentId: string, type: 'line' | 'cubic'): SplinePathData {
  const seg = data.segments[segmentId]
  if (!seg) return data
  const segments = { ...data.segments, [segmentId]: { ...seg, type } }
  if (type !== 'cubic') return { ...data, segments }

  const from = data.points[seg.fromPointId], to = data.points[seg.toPointId]
  if (!from || !to) return { ...data, segments }
  const handles = { ...data.handles }
  if (!getHandle(data, from.id, 'out')) {
    const id = uid('h'); handles[id] = { id, pointId: from.id, kind: 'out', x: lerp(from.x, to.x, 1 / 3), y: lerp(from.y, to.y, 1 / 3), locked: false }
  }
  if (!getHandle(data, to.id, 'in')) {
    const id = uid('h'); handles[id] = { id, pointId: to.id, kind: 'in', x: lerp(from.x, to.x, 2 / 3), y: lerp(from.y, to.y, 2 / 3), locked: false }
  }
  return { ...data, segments, handles }
}

// ── Open / close a contour ────────────────────────────────────────────────────

export function setContourClosed(data: SplinePathData, contourId: string, closed: boolean): SplinePathData {
  const contour = data.contours[contourId]
  if (!contour || contour.closed === closed) return data
  const segments = { ...data.segments }
  let segmentIds = [...contour.segmentIds]
  const firstId = contour.pointIds[0]
  const lastId  = contour.pointIds[contour.pointIds.length - 1]

  if (closed) {
    if (firstId && lastId && firstId !== lastId) {
      const seg: SplineSegment = { id: uid('seg'), fromPointId: lastId, toPointId: firstId, type: 'line' }
      segments[seg.id] = seg
      segmentIds.push(seg.id)
    }
  } else {
    const closingId = segmentIds.find(sid => {
      const s = segments[sid]; return s && s.fromPointId === lastId && s.toPointId === firstId
    })
    if (closingId) { delete segments[closingId]; segmentIds = segmentIds.filter(s => s !== closingId) }
  }
  return { ...data, segments, contours: { ...data.contours, [contourId]: { ...contour, closed, segmentIds } } }
}

// ── Reverse a contour's direction ─────────────────────────────────────────────

export function reverseContour(data: SplinePathData, contourId: string): SplinePathData {
  const contour = data.contours[contourId]
  if (!contour) return data
  const segments = { ...data.segments }
  // Start from the new first anchor. A closed contour's old closing segment
  // becomes the new closing segment, rather than the first edge.
  const segmentIds = [...contour.segmentIds].reverse()
  if (contour.closed && segmentIds.length > 0) segmentIds.push(segmentIds.shift()!)
  for (const sid of segmentIds) {
    const s = segments[sid]
    if (s) segments[sid] = { ...s, fromPointId: s.toPointId, toPointId: s.fromPointId }
  }
  const handles = { ...data.handles }
  for (const h of Object.values(data.handles)) {
    if (contour.pointIds.includes(h.pointId)) handles[h.id] = { ...h, kind: h.kind === 'in' ? 'out' : 'in' }
  }
  return { ...data, handles, segments, contours: { ...data.contours, [contourId]: { ...contour, pointIds: [...contour.pointIds].reverse(), segmentIds } } }
}

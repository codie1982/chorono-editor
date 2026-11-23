import type { SplinePathData, SplinePointType } from '../../types/spline'
import type { Vec2 } from '../../geometry/CoordinateSystem'
import { segmentControls } from '../corners/segmentGeometry'
import { moveSplinePoint, setSegmentType } from './mutations'
import { uid } from '../util/uid'

/** Portable tangent value: offsets in layer-local px, never anchor coordinates,
 * source IDs or layer transforms. Optional handles support open endpoints. */
export interface SplineTangents { type: SplinePointType; in?: Vec2; out?: Vec2 }

/** Read independent clipboard data without mutating source or history. Explicit
 * quadratic controls are represented by their equivalent cubic endpoint handle.
 * Actual stored cubic handles (including inactive endpoint handles) take priority. */
export function copySplineTangents(data: SplinePathData, pointId: string): SplineTangents {
  const point = data.points[pointId]
  if (!point) throw new Error('Select an existing point to Copy Tangents.')
  const value: SplineTangents = { type: point.type }
  for (const edge of Object.values(data.segments)) if (edge.type === 'quadratic' && (edge.fromPointId === pointId || edge.toPointId === pointId)) {
    const controls = segmentControls(data, edge.id), kind = edge.fromPointId === pointId ? 'out' : 'in'
    value[kind] = { x: (controls[1].x - point.x) * 2 / 3, y: (controls[1].y - point.y) * 2 / 3 }
  }
  for (const handle of Object.values(data.handles)) if (handle.pointId === pointId) value[handle.kind] = { x: handle.x - point.x, y: handle.y - point.y }
  return value
}

/** Validate external tangent payloads before any allocation. Connection type
 * and finite local offsets are required; anchors never come from the clipboard. */
export function assertSplineTangents(value: SplineTangents): void {
  if (!value || !['corner', 'smooth', 'bezier', 'bezierCorner'].includes(value.type)) throw new Error('Invalid tangent point type.')
  for (const kind of ['in', 'out'] as const) if (value[kind] && ![value[kind]!.x, value[kind]!.y].every(Number.isFinite)) throw new Error('Tangent offsets must be finite local px.')
}

/** Promote only adjacent edges needed by tangent editing. Lines use the existing
 * converter; quadratic degree elevation is exact, including the unselected end.
 * Existing handle IDs are retained. Private record copies belong to the caller. */
function cubicNeighbors(data: SplinePathData, pointIds: ReadonlySet<string>, promoteLines = true): SplinePathData {
  let next = data
  for (const edge of Object.values(data.segments)) {
    if (!pointIds.has(edge.fromPointId) && !pointIds.has(edge.toPointId)) continue
    if (edge.type === 'line' && promoteLines) next = setSegmentType(next, edge.id, 'cubic')
    else if (edge.type === 'quadratic') {
      const [a, q, b] = segmentControls(next, edge.id), handles = { ...next.handles }
      for (const [pointId, kind, anchor] of [[edge.fromPointId, 'out', a], [edge.toPointId, 'in', b]] as const) {
        const old = Object.values(handles).find(handle => handle.pointId === pointId && handle.kind === kind), id = old?.id ?? uid('h')
        handles[id] = { ...old, id, pointId, kind, x: anchor.x + (q.x - anchor.x) * 2 / 3, y: anchor.y + (q.y - anchor.y) * 2 / 3, locked: old?.locked ?? false }
      }
      const { control1: _one, control2: _two, ...record } = edge
      next = { ...next, handles, segments: { ...next.segments, [edge.id]: { ...record, type: 'cubic' } } }
    }
  }
  return next
}

/** Apply local handle offsets/type to all targets in one pure edit. Anchors,
 * unrelated handle vectors and layer TRS are untouched. Target handle IDs are
 * reused, absent clipboard handles remove corresponding target handles. */
export function pasteSplineTangents(data: SplinePathData, ids: readonly string[], value: SplineTangents): SplinePathData {
  assertSplineTangents(value)
  const selected = new Set(ids)
  if (!selected.size || ids.some(id => !data.points[id])) throw new Error('Select existing points to Paste Tangents.')
  const next = cubicNeighbors(data, selected, !!(value.in || value.out))
  const points = { ...next.points }, handles = { ...next.handles }
  let changed = false
  for (const id of Array.from(selected)) {
    const point = points[id]
    if (point.type !== value.type) { points[id] = { ...point, type: value.type }; changed = true }
    for (const kind of ['in', 'out'] as const) {
      const old = Object.values(handles).find(handle => handle.pointId === id && handle.kind === kind), offset = value[kind]
      if (!offset) { if (old) { delete handles[old.id]; changed = true }; continue }
      if (old?.x === point.x + offset.x && old?.y === point.y + offset.y) continue
      const handleId = old?.id ?? uid('h')
      handles[handleId] = { ...old, id: handleId, pointId: id, kind, x: point.x + offset.x, y: point.y + offset.y, locked: old?.locked ?? false }
      changed = true
    }
  }
  return changed ? { ...next, points, handles } : next
}

/** Recompute handles from original neighboring anchors, independent of selection
 * order. Chord/3 lengths: Smooth uses a common chord direction with independent
 * lengths; Bézier mirrors the shorter adjacent length; Bézier Corner uses each
 * adjacent chord independently; Corner removes handles. Coincident anchors give
 * zero handles or use the remaining direction. Anchors/topology IDs do not move. */
export function resetSplineTangents(data: SplinePathData, ids: readonly string[]): SplinePathData {
  if (!ids.length || ids.some(id => !data.points[id])) throw new Error('Select existing points to Reset Tangents.')
  let next = data
  for (const id of Array.from(new Set(ids))) {
    const point = data.points[id], contour = Object.values(data.contours).find(item => item.pointIds.includes(id))!, index = contour.pointIds.indexOf(id), count = contour.pointIds.length
    const prev = index || contour.closed ? data.points[contour.pointIds[(index + count - 1) % count]] : undefined
    const after = index < count - 1 || contour.closed ? data.points[contour.pointIds[(index + 1) % count]] : undefined
    let incoming = prev ? { x: (prev.x - point.x) / 3, y: (prev.y - point.y) / 3 } : undefined
    let outgoing = after ? { x: (after.x - point.x) / 3, y: (after.y - point.y) / 3 } : undefined
    incoming ??= outgoing ? { x: -outgoing.x, y: -outgoing.y } : { x: 0, y: 0 }
    outgoing ??= { x: -incoming.x, y: -incoming.y }
    if (point.type === 'smooth' || point.type === 'bezier') {
      const dx = outgoing.x - incoming.x, dy = outgoing.y - incoming.y, length = Math.hypot(dx, dy)
      const fallback = Math.hypot(outgoing.x, outgoing.y) ? outgoing : { x: -incoming.x, y: -incoming.y }, denominator = length || Math.hypot(fallback.x, fallback.y) || 1
      const direction = length ? { x: dx / length, y: dy / length } : { x: fallback.x / denominator, y: fallback.y / denominator }
      let inLength = Math.hypot(incoming.x, incoming.y), outLength = Math.hypot(outgoing.x, outgoing.y)
      if (point.type === 'bezier') inLength = outLength = Math.min(inLength, outLength)
      incoming = { x: -direction.x * inLength, y: -direction.y * inLength }; outgoing = { x: direction.x * outLength, y: direction.y * outLength }
    }
    next = pasteSplineTangents(next, [id], { type: point.type, ...(point.type === 'corner' ? {} : { in: incoming, out: outgoing }) })
  }
  return next
}

/** Move selected anchors and their handles to the arithmetic centroid in local
 * px. IDs, contours and connectivity remain distinct (unlike Weld). Reuses the
 * canonical rigid point/handle move; no source mutation, no layer TRS changes. */
export function fuseSplinePoints(data: SplinePathData, ids: readonly string[]): SplinePathData {
  const selected = Array.from(new Set(ids))
  if (selected.length < 2 || selected.some(id => !data.points[id])) throw new Error('Select at least two existing points to Fuse.')
  const x = selected.reduce((sum, id) => sum + data.points[id].x / selected.length, 0), y = selected.reduce((sum, id) => sum + data.points[id].y / selected.length, 0)
  return selected.reduce((next, id) => next.points[id].x === x && next.points[id].y === y ? next : moveSplinePoint(next, id, x, y), data)
}

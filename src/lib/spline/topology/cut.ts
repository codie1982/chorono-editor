import type { SplinePathData } from '../../types/spline'
import { insertPointOnSegment } from '../edit/mutations'
import { uid } from '../util/uid'

/** Explain why a batch cannot break at its existing anchors. Every selected
 * point must have incoming and outgoing edges; open endpoints are already cut.
 * The normalized model owns each point in exactly one contour. */
export function splineBreakReason(data: SplinePathData, ids: readonly string[]): string | undefined {
  if (!ids.length) return 'Select one or more interior points or points on a closed contour.'
  for (const id of ids) {
    const contour = Object.values(data.contours).find(item => item.pointIds.includes(id))
    if (!contour) return 'A selected point no longer exists.'
    if (!contour.closed && (contour.pointIds[0] === id || contour.pointIds.at(-1) === id)) return 'Open endpoints are already separate. Select interior points to Break.'
  }
}

/** Cut at existing anchors without moving or approximating any curve. Original
 * IDs own incoming endpoints; fresh duplicates own outgoing endpoints. A closed
 * loop opens, an open contour becomes two contours in the same Object. Outgoing
 * handles transfer by ID to their new owner; no points/edges are shared or lost.
 * Pure, layer-local px; all-or-nothing validation precedes private allocation. */
export function breakSplinePoints(data: SplinePathData, ids: readonly string[]): { data: SplinePathData; pointIds: string[] } {
  const selected = Array.from(new Set(ids)), reason = splineBreakReason(data, selected)
  if (reason) throw new Error(reason)
  const next: SplinePathData = { ...data, points: { ...data.points }, handles: { ...data.handles }, segments: { ...data.segments }, contours: { ...data.contours }, subShapes: { ...data.subShapes } }
  const pointIds: string[] = []
  for (const id of Array.from(selected)) {
    const contour = Object.values(next.contours).find(item => item.pointIds.includes(id))!, index = contour.pointIds.indexOf(id)
    const duplicate = uid('pt'), outgoing = contour.segmentIds[index]
    next.points[duplicate] = { ...next.points[id], id: duplicate }
    next.segments[outgoing] = { ...next.segments[outgoing], fromPointId: duplicate }
    for (const handle of Object.values(next.handles)) if (handle.pointId === id && handle.kind === 'out') next.handles[handle.id] = { ...handle, pointId: duplicate }
    if (contour.closed) next.contours[contour.id] = { ...contour, closed: false,
      pointIds: [duplicate, ...contour.pointIds.slice(index + 1), ...contour.pointIds.slice(0, index + 1)],
      segmentIds: [...contour.segmentIds.slice(index), ...contour.segmentIds.slice(0, index)] }
    else {
      const tail = uid('cnt')
      next.contours[contour.id] = { ...contour, pointIds: contour.pointIds.slice(0, index + 1), segmentIds: contour.segmentIds.slice(0, index) }
      next.contours[tail] = { ...contour, id: tail, pointIds: [duplicate, ...contour.pointIds.slice(index + 1)], segmentIds: contour.segmentIds.slice(index) }
      const owner = Object.values(next.subShapes).find(item => item.contourIds.includes(contour.id))!
      next.subShapes[owner.id] = { ...owner, contourIds: owner.contourIds.flatMap(item => item === contour.id ? [item, tail] : [item]) }
    }
    pointIds.push(id, duplicate)
  }
  return { data: next, pointIds }
}

/** Split selected edges at the same strictly interior parameter (not arc
 * length). Reuses exact De Casteljau insertion then Break's ownership rules.
 * Line/quadratic/cubic curves and unrelated contours are preserved. Returned
 * edge IDs cover both sides of every cut for continued Edge-mode selection. */
export function splitSplineEdges(data: SplinePathData, ids: readonly string[], t = .5): { data: SplinePathData; edgeIds: string[] } {
  if (!Number.isFinite(t) || t <= 0 || t >= 1) throw new Error('Split position must be between 0 and 100%, exclusively.')
  const selected = Array.from(new Set(ids))
  if (!selected.length || selected.some(id => !data.segments[id])) throw new Error('Select existing edges to Split.')
  let next = data
  const edgeIds: string[] = []
  for (const id of Array.from(selected)) {
    const inserted = insertPointOnSegment(next, id, t), point = Object.keys(inserted.points).find(key => !next.points[key])!
    edgeIds.push(...Object.keys(inserted.segments).filter(key => !next.segments[key]))
    next = breakSplinePoints(inserted, [point]).data
  }
  return { data: next, edgeIds }
}

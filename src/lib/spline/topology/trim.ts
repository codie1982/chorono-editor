import type { SplinePathData } from '../../types/spline'
import { intersectBezierCurves, bezierHullsOverlap, bezierSelfIntersections } from '../../geometry/bezier/intersections'
import { segmentControls } from '../corners/segmentGeometry'
import { insertPointOnSegment } from '../edit/mutations'
import { deleteSplineEdges } from './edges'
import { assertEdgeBoundaryBudget, splineEdgeBoundaries, type SplineEdgeBoundary } from './edgeBoundaries'

/** Split one source edge at ordered interior parameters using the canonical
 * exact insertion. Returned parts map original parameter intervals to IDs. */
function partition(data: SplinePathData, edgeId: string, cuts: number[]) {
  let next = data, tail = edgeId, last = 0
  const parts: { id: string; from: number; to: number }[] = []
  for (const t of cuts) {
    const before = next, endpoint = before.segments[tail].toPointId
    next = insertPointOnSegment(before, tail, (t - last) / (1 - last))
    const point = Object.keys(next.points).find(id => !before.points[id])!
    const left = Object.values(next.segments).find(edge => edge.toPointId === point)!
    parts.push({ id: left.id, from: last, to: t })
    tail = Object.values(next.segments).find(edge => edge.fromPointId === point && edge.toPointId === endpoint)!.id; last = t
  }
  parts.push({ id: tail, from: last, to: 1 })
  return { data: next, parts }
}

/** Remove the clicked contour interval between consecutive intersections. It
 * may span several edges or wrap around a closed contour's seam. Open endpoints
 * are terminal limits after at least one intersection; closed contours require
 * two distinct cuts. Neighbor joins alone do not count as intersections.
 * Pure local-px geometry; exact Bézier insertion + existing edge-run deletion
 * preserve all unselected curves, owners and holes. Clicks on a cut, unresolved
 * overlaps and budgets refuse. No intersections return original identity, so no
 * empty Undo. Boundaries are read-only and may include other visible splines. */
export function trimSplineAt(data: SplinePathData, edgeId: string, t: number, boundaries = splineEdgeBoundaries(data)): { data: SplinePathData; edgeIds: string[]; reason?: string } {
  if (!Number.isFinite(t) || t < 0 || t > 1 || !data.segments[edgeId]) throw new Error('Trim needs an existing edge and a parameter between 0 and 1.')
  const contour = Object.values(data.contours).find(item => item.segmentIds.includes(edgeId))!, count = contour.segmentIds.length
  assertEdgeBoundaryBudget(boundaries, count)
  const cuts: number[] = [], click = contour.segmentIds.indexOf(edgeId) + t, budget = { remaining: 60000 }
  let pairs = 0
  for (let index = 0; index < count; index++) {
    const id = contour.segmentIds[index], edge = data.segments[id], controls = segmentControls(data, id)
    for (const hit of bezierSelfIntersections(controls)) for (const parameter of [hit.t, hit.u]) {
      const position = index + parameter
      if (!cuts.some(old => Math.abs(old - position) < 1e-7)) cuts.push(position)
    }
    for (const boundary of boundaries) {
      if (boundary.sourceEdgeId === id || !bezierHullsOverlap(controls, boundary.controls)) continue
      if (++pairs > 2048) throw new Error('Trim intersection budget exceeded; isolate fewer overlapping splines.')
      for (const hit of intersectBezierCurves(controls, boundary.controls, budget)) {
        const other = boundary.sourceEdgeId ? data.segments[boundary.sourceEdgeId] : undefined
        if (other && ((hit.t < 1e-7 || hit.t > 1 - 1e-7) && [other.fromPointId, other.toPointId].includes(hit.t < .5 ? edge.fromPointId : edge.toPointId))) continue
        let position = index + hit.t
        if (contour.closed && Math.abs(position - count) < 1e-7) position = 0
        if (!cuts.some(old => Math.abs(old - position) < 1e-7)) cuts.push(position)
      }
    }
  }
  if (!contour.closed) for (let i = cuts.length - 1; i >= 0; i--) if (cuts[i] < 1e-7 || cuts[i] > count - 1e-7) cuts.splice(i, 1)
  cuts.sort((a, b) => a - b)
  if (!cuts.length || contour.closed && cuts.length < 2) return { data, edgeIds: [edgeId], reason: 'Trim needs intersections bounding the clicked part.' }
  const clickPosition = contour.closed && click === count ? 0 : click
  if (cuts.some(cut => Math.abs(cut - clickPosition) < 1e-7)) throw new Error('Click between intersections, away from the intersection itself.')
  const limits = contour.closed ? cuts : [0, ...cuts.filter(cut => cut > 1e-7 && cut < count - 1e-7), count]
  const previous = limits.filter(cut => cut < clickPosition).at(-1), following = limits.find(cut => cut > clickPosition)
  const from = previous ?? limits.at(-1)!, to = following ?? limits[0]
  const removed = from < to ? [[from, to]] : [[from, count], [0, to]]
  let next = data
  const deleteIds: string[] = [], retained: string[] = []
  for (let index = 0; index < count; index++) {
    const localCuts = removed.flatMap(range => range).map(value => value - index).filter(value => value > 1e-7 && value < 1 - 1e-7).sort((a, b) => a - b)
    const split = partition(next, contour.segmentIds[index], Array.from(new Set(localCuts))); next = split.data
    for (const part of split.parts) {
      const mid = index + (part.from + part.to) / 2
      if (removed.some(([lo, hi]) => mid > lo && mid < hi)) deleteIds.push(part.id)
      else if (part.id !== contour.segmentIds[index] || contour.segmentIds[index] === edgeId) retained.push(part.id)
    }
  }
  next = deleteSplineEdges(next, deleteIds)
  return { data: next, edgeIds: retained.filter(id => !!next.segments[id]) }
}

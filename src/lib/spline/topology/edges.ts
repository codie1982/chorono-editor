import type { SplinePathData, SplineContour } from '../../types/spline'
import { insertPointOnSegment, deleteSplinePoint } from '../edit/mutations'
import { uid } from '../util/uid'
import { removeSplineContours, retainSplineContours } from './records'

/** Split each selected edge into equal PARAMETER intervals (not arc length).
 * Existing De Casteljau splitting preserves line/quadratic/cubic geometry.
 * Shared endpoints are retained; new anchor/edge IDs are allocated once per
 * call. Invalid counts/IDs throw before the caller commits one source command. */
export function divideSplineEdges(data: SplinePathData, ids: readonly string[], parts = 2): SplinePathData {
  if (!Number.isInteger(parts) || parts < 2 || parts > 64) throw new Error('Divide requires 2–64 parts per edge.')
  const selected = Array.from(new Set(ids)), added = selected.length * (parts - 1)
  if (Object.keys(data.points).length + added > 10000 || Object.keys(data.segments).length + added > 10000) throw new Error('Divide exceeds the 10,000-point/edge spline budget. Select fewer edges.')
  let next = data
  for (const id of selected) {
    const original = next.segments[id]
    if (!original) throw new Error('A selected spline edge no longer exists.')
    let remaining = id
    for (let index = 1; index < parts; index++) {
      const before = next
      next = insertPointOnSegment(before, remaining, 1 / (parts - index + 1))
      const point = Object.keys(next.points).find(id => !before.points[id])
      const tail = Object.values(next.segments).find(edge => edge.fromPointId === point && edge.toPointId === original.toPointId)
      if (!tail) throw new Error('The spline edge could not be divided.')
      remaining = tail.id
    }
  }
  return next
}

/** Cut selected edges without drawing replacement bridges. A closed contour
 * opens at its first cut; further cuts create ordered independent open runs.
 * Runs retain existing edge/point IDs, the first keeps the old contour ID and
 * extra runs get fresh contour IDs within the same Object. Isolated anchors and
 * empty Objects are removed, so no orphan geometry survives. */
export function deleteSplineEdges(data: SplinePathData, ids: readonly string[]): SplinePathData {
  const removed = new Set(ids)
  if (!Array.from(removed).some(id => data.segments[id])) return data
  const contours = { ...data.contours }, subShapes = { ...data.subShapes }
  for (const contour of Object.values(data.contours)) {
    if (!contour.segmentIds.some(id => removed.has(id))) continue
    const firstCut = contour.segmentIds.findIndex(id => removed.has(id))
    const ordered = contour.closed ? [...contour.segmentIds.slice(firstCut + 1), ...contour.segmentIds.slice(0, firstCut + 1)] : contour.segmentIds
    const runs: string[][] = []
    let run: string[] = []
    for (const id of ordered) {
      if (removed.has(id)) { if (run.length) runs.push(run); run = [] }
      else run.push(id)
    }
    if (run.length) runs.push(run)
    delete contours[contour.id]
    const replacements: SplineContour[] = runs.map((segmentIds, index) => ({ ...contour, id: index === 0 ? contour.id : uid('cnt'), closed: false,
      segmentIds, pointIds: [data.segments[segmentIds[0]].fromPointId, ...segmentIds.map(id => data.segments[id].toPointId)] }))
    for (const replacement of replacements) contours[replacement.id] = replacement
    for (const object of Object.values(subShapes)) if (object.contourIds.includes(contour.id)) subShapes[object.id] = {
      ...object, contourIds: object.contourIds.flatMap(id => id === contour.id ? replacements.map(item => item.id) : [id]),
    }
  }
  return retainSplineContours({ ...data, subShapes }, contours)
}

/** Batch native point deletion reuses the legacy adjacent-edge merge (a new
 * straight edge, not a curve-fit). A contour with two remaining anchors is
 * removed when one is deleted; other contours/Objects remain intact. */
export function deleteSplinePoints(data: SplinePathData, ids: readonly string[]): SplinePathData {
  return Array.from(new Set(ids)).reduce((next, id) => {
    const contour = Object.values(next.contours).find(contour => contour.pointIds.includes(id))
    if (!contour) return next
    return contour.pointIds.length <= 2 ? removeSplineContours(next, new Set([contour.id])) : deleteSplinePoint(next, id)
  }, data)
}

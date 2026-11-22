import type { FlattenedContour } from '../flattenPathContours'
import { assertSimplePolyline, assertSimpleRing, ringArea, ringContacts, ringContains } from './contours'

/** Classify material boundaries without changing contour order or winding.
 * evenodd uses nesting depth. nonzero uses 0↔nonzero transitions; redundant
 * same-winding boundaries get role 0 and cannot define an inside/outside offset.
 * Crossing/touching closed rings refuse rather than guessing hole ownership. */
export function classifyPlanarBoundaries(contours: readonly FlattenedContour[], fillRule: 'nonzero' | 'evenodd') {
  const closed = contours.flatMap((contour, i) => contour.closed ? [i] : [])
  contours.forEach(contour => contour.closed ? assertSimpleRing(contour.points) : assertSimplePolyline(contour.points))
  const areas = contours.map(contour => contour.closed ? ringArea(contour.points) : 0)
  for (let a = 0; a < closed.length; a++) for (let b = a + 1; b < closed.length; b++) if (ringContacts(contours[closed[a]].points, contours[closed[b]].points)) throw new Error('Geometry requires disjoint or nested boundaries; touching/crossing contours are unsupported.')
  const parents = contours.map((contour, i) => {
    if (!contour.closed) return -1
    let parent = -1, area = Infinity
    for (const j of closed) if (j !== i && Math.abs(areas[j]) > Math.abs(areas[i]) && Math.abs(areas[j]) < area && ringContains(contours[j].points, contour.points[0])) { parent = j; area = Math.abs(areas[j]) }
    return parent
  })
  const roles = contours.map((contour, i) => {
    if (!contour.closed) return 0
    let depth = 0, winding = 0, index = parents[i]
    while (index !== -1) { depth++; winding += Math.sign(areas[index]); index = parents[index] }
    if (fillRule === 'evenodd') return depth % 2 ? -1 : 1
    return !winding ? 1 : winding + Math.sign(areas[i]) === 0 ? -1 : 0
  })
  return { roles, parents, areas }
}

import type { SplinePathData } from '../../types/spline'
import type { PathDefinition } from '../../geometry/PathCommand'
import type { Vec2 } from '../../geometry/CoordinateSystem'

export const CORNER_LIMITS = Object.freeze({ points: 128, commands: 2048, contours: 32, validationVertices: 4096, lengthSamples: 262144 })
export interface CornerSource { data: SplinePathData; pointIds: string[]; matrix: [number, number, number, number, number, number] }
/** Complete replacement at one source anchor; bridge controls use world px.
 * incoming/outgoing parameters refer to the ORIGINAL adjacent edges, not a
 * sequentially trimmed intermediate. Bridge pieces share exact endpoints. */
export interface CornerReplacement { pointId: string; incoming: number; outgoing: number; bridge: Vec2[][] }
export interface CornerCut { removedId: string; incomingId: string; outgoingId: string; segmentIds: string[] }
export interface CornerResult { data: SplinePathData; path: PathDefinition; markers: Vec2[]; cuts: CornerCut[] }

/** Stable source-order selection of interior anchors. Refuse missing points,
 * open endpoints and excessive selection as a batch, without guessing fallback. */
export function selectSplineCorners(data: SplinePathData, ids: readonly string[], label: string, max: number = CORNER_LIMITS.points): string[] {
  const selected = new Set(ids)
  if (!selected.size || selected.size > max || ids.some(id => !Object.hasOwn(data.points, id))) throw new Error(`Select 1–${max} existing spline points for ${label}.`)
  const points: string[] = []
  for (const contour of Object.values(data.contours)) for (let i = 0; i < contour.pointIds.length; i++) if (selected.has(contour.pointIds[i])) {
    if (!contour.closed && (i === 0 || i === contour.pointIds.length - 1)) throw new Error(`${label} needs two adjacent edges; open endpoints cannot be rounded or chamfered.`)
    points.push(contour.pointIds[i])
  }
  if (points.length !== selected.size) throw new Error(`${label} selection has no owning contour.`)
  return points
}

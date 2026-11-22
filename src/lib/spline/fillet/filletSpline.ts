import { prepareCornerSource, replaceSplineCorners, segmentControls, type CornerReplacement } from '../corners'
import { solveFilletCorner } from '../../geometry/fillet/solveFilletCorner'
import { FILLET_LIMITS, assertFilletSettings, type FilletRequest, type FilletResult, type FilletArc } from './types'

/** Radius-based strategy over the shared Chamfer/Fillet source splice. Each
 * selected corner solves independently against original world curves; the splice
 * then detects adjacent trim overlap and validates complete Object boundaries.
 * Fresh circular cubic bridges preserve original Q/C retained edge degrees,
 * IDs and manual paint/transform tracks. No input mutation or runtime resources. */
export function filletSpline(request: FilletRequest): FilletResult {
  assertFilletSettings(request)
  const { data, ids, matrix } = prepareCornerSource(request, 'Fillet', FILLET_LIMITS.points)
  const incoming = new Map(Object.values(data.segments).map(edge => [edge.toPointId, edge])), outgoing = new Map(Object.values(data.segments).map(edge => [edge.fromPointId, edge]))
  const replacements: CornerReplacement[] = [], arcs: FilletArc[] = []
  for (const pointId of ids) {
    const a = segmentControls(data, incoming.get(pointId)!.id).map(p => matrix.applyToPoint(p)), b = segmentControls(data, outgoing.get(pointId)!.id).map(p => matrix.applyToPoint(p))
    const solution = solveFilletCorner(a, b, request.radiusPx)
    replacements.push({ pointId, incoming: solution.incoming, outgoing: solution.outgoing, bridge: solution.curves })
    arcs.push({ pointId, center: solution.center, radiusPx: request.radiusPx, sweepRad: solution.sweepRad, radialErrorBoundPx: solution.radialErrorBoundPx, tangentErrorRad: solution.tangentErrorRad })
  }
  return { ...replaceSplineCorners(request, replacements, 'Fillet'), arcs }
}

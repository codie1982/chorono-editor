import { bezierLengthTable, parameterAtArcLength } from '../../geometry/bezier/arcLength'
import { evaluateBezier } from '../../geometry/bezier/curves'
import { prepareCornerSource, replaceSplineCorners, segmentControls, CORNER_LIMITS as limits, type CornerReplacement } from '../corners'
import { assertChamferSettings, type ChamferRequest, type ChamferResult } from './types'

/** Equal-distance straight bevel strategy over the shared atomic corner splice.
 * Arc distances are world px; exact Bézier trims, ownership/ID preservation,
 * overlap checks and boundary validation share Fillet's topology implementation.
 * No source mutation; new IDs allocate once per preview, then survive Redo. */
export function chamferSpline(request: ChamferRequest): ChamferResult {
  assertChamferSettings(request)
  const { data, ids, matrix } = prepareCornerSource(request, 'Chamfer'), selected = new Set(ids)
  const replacements = new Map<string, CornerReplacement>(ids.map(pointId => [pointId, { pointId, incoming: 0, outgoing: 0, bridge: [[{ x: 0, y: 0 }, { x: 0, y: 0 }]] }]))
  let samples = 0
  for (const edge of Object.values(data.segments)) {
    const from = selected.has(edge.fromPointId), to = selected.has(edge.toPointId)
    if (!from && !to) continue
    const controls = segmentControls(data, edge.id).map(p => matrix.applyToPoint(p)), table = bezierLengthTable(controls)
    samples += table.samples.length
    if (samples > limits.lengthSamples) throw new Error('Chamfer arc-length sample budget exceeded. Select fewer points.')
    const start = from ? request.distancePx : 0, end = table.length - (to ? request.distancePx : 0)
    if (!(end - start > .01)) throw new Error('Chamfer cuts overlap or consume an adjacent edge. Reduce the distance.')
    if (from) { const r = replacements.get(edge.fromPointId)!; r.outgoing = parameterAtArcLength(table, start); r.bridge[0][1] = evaluateBezier(controls, r.outgoing) }
    if (to) { const r = replacements.get(edge.toPointId)!; r.incoming = parameterAtArcLength(table, end); r.bridge[0][0] = evaluateBezier(controls, r.incoming) }
  }
  for (const r of Array.from(replacements.values())) if (Math.hypot(r.bridge[0][0].x - r.bridge[0][1].x, r.bridge[0][0].y - r.bridge[0][1].y) < .01) throw new Error('Chamfer creates a zero-length bevel. Choose a different corner or distance.')
  const result = replaceSplineCorners(request, Array.from(replacements.values()), 'Chamfer')
  return { ...result, cuts: result.cuts.map(c => ({ removedId: c.removedId, incomingId: c.incomingId, outgoingId: c.outgoingId, bevelId: c.segmentIds[0] })) }
}

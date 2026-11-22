import { Matrix2D } from '../../geometry/Matrix2D'
import { bezierLengthTable } from '../../geometry/bezier/arcLength'
import { trimBezier } from '../../geometry/bezier/curves'
import { transformPathDefinition } from '../../geometry/transformPathDefinition'
import { assertSplineTopology, assertSplineLocks, markEditedSubShapes } from '../topology'
import { splineToPathDefinition } from '../splineToPath'
import { createSplineIdAllocator } from '../util/uid'
import { segmentControls, writeSegmentControls } from './segmentGeometry'
import { validateCornerBoundaries } from './validateBoundaries'
import { selectSplineCorners, CORNER_LIMITS as limits, type CornerSource, type CornerReplacement, type CornerResult, type CornerCut } from './types'

/** Validate plain source, finite affine matrix, ownership and selection before
 * numerical work. No scene, renderer, animation or mutable resource dependency. */
export function prepareCornerSource(request: CornerSource, label: string, max: number = limits.points) {
  const { data } = request
  assertSplineTopology(data)
  const ids = selectSplineCorners(data, request.pointIds, label, max)
  if (Object.values(data.points).some(p => p.locked) || Object.values(data.handles).some(h => h.locked)) throw new Error(`Unlock spline points and handles before ${label}.`)
  if (!Array.isArray(request.matrix) || request.matrix.length !== 6 || request.matrix.some(n => !Number.isFinite(n))) throw new Error(`Invalid ${label} transform.`)
  const matrix = new Matrix2D(...request.matrix), inverse = matrix.invert()
  return { data, ids, matrix, inverse }
}

/** Shared atomic topology splice for Chamfer/Fillet. Retain edge/contour/Object
 * IDs and untouched records; replace selected points by fresh bridge anchors.
 * Both ends of a shared edge trim once against original t; overlap/degenerate
 * retained geometry refuses. Bridges are 2/3/4-point world control polygons;
 * only affected coordinates convert through inverse affine. Native source
 * remains portable and exact-degree; source input is never mutated. */
export function replaceSplineCorners(request: CornerSource, replacements: readonly CornerReplacement[], label: string): CornerResult {
  const { data, ids, matrix, inverse } = prepareCornerSource(request, label)
  const selected = new Set(ids), changes = new Map(replacements.map(r => [r.pointId, r]))
  if (changes.size !== ids.length || ids.some(id => !changes.has(id))) throw new Error(`Incomplete ${label} corner solution.`)
  const allocate = createSplineIdAllocator((['points', 'handles', 'segments', 'contours', 'subShapes'] as const).flatMap(family => Object.keys(data[family])))
  const next = { ...data, points: { ...data.points }, handles: { ...data.handles }, segments: { ...data.segments }, contours: { ...data.contours } }
  const cuts: CornerCut[] = [], bridgeIds = new Map<string, string[]>()
  for (const id of ids) {
    const change = changes.get(id)!
    if (!Number.isFinite(change.incoming) || !Number.isFinite(change.outgoing) || change.incoming <= 0 || change.incoming >= 1 || change.outgoing <= 0 || change.outgoing >= 1 || !change.bridge.length || change.bridge.length > 32) throw new Error(`Invalid ${label} trim or bridge.`)
    const points = [allocate('pt'), ...change.bridge.map(() => allocate('pt'))], segments = change.bridge.map(() => allocate('seg'))
    cuts.push({ removedId: id, incomingId: points[0], outgoingId: points.at(-1)!, segmentIds: segments }); bridgeIds.set(id, points)
    change.bridge.forEach((controls, i) => {
      if (controls.length < 2 || controls.length > 4 || controls.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error(`Invalid ${label} bridge controls.`)
      for (const [index, control] of [[i, controls[0]], [i + 1, controls.at(-1)!]] as const) {
        const pid = points[index], position = inverse.applyToPoint(control), old = next.points[pid]
        if (old && Math.hypot(old.x - position.x, old.y - position.y) > 1e-6) throw new Error(`Disconnected ${label} bridge.`)
        next.points[pid] = { id: pid, ...position, type: controls.length === 4 ? 'bezierCorner' : 'corner' }
      }
      const segment = { id: segments[i], fromPointId: points[i], toPointId: points[i + 1], type: controls.length === 4 ? 'cubic' as const : controls.length === 3 ? 'quadratic' as const : 'line' as const }
      next.segments[segment.id] = segment; writeSegmentControls(next, segment, controls.map(p => inverse.applyToPoint(p)), allocate)
    })
  }
  const cutMap = new Map(cuts.map(c => [c.removedId, c])); let samples = 0
  for (const edge of Object.values(data.segments)) {
    const from = changes.get(edge.fromPointId), to = changes.get(edge.toPointId)
    if (!from && !to) continue
    const lo = from?.outgoing ?? 0, hi = to?.incoming ?? 1
    if (!(hi > lo)) throw new Error(`${label} cuts overlap or consume an adjacent edge. Reduce the amount.`)
    const world = trimBezier(segmentControls(data, edge.id).map(p => matrix.applyToPoint(p)), lo, hi), table = bezierLengthTable(world)
    samples += table.samples.length
    if (samples > limits.lengthSamples) throw new Error(`${label} arc-length sample budget exceeded. Select fewer points.`)
    if (table.length <= .01) throw new Error(`${label} cuts overlap or consume an adjacent edge. Reduce the amount.`)
    const fromId = cutMap.get(edge.fromPointId)?.outgoingId ?? edge.fromPointId, toId = cutMap.get(edge.toPointId)?.incomingId ?? edge.toPointId
    for (const [id, position] of [[fromId, world[0]], [toId, world.at(-1)!]] as const) if (!data.points[id]) {
      const actual = matrix.applyToPoint(next.points[id])
      if (Math.hypot(actual.x - position.x, actual.y - position.y) > .001) throw new Error(`${label} bridge does not meet the retained edge.`)
    }
    const segment = { ...edge, fromPointId: fromId, toPointId: toId }; next.segments[edge.id] = segment
    if (segment.type === 'cubic') for (const id of [fromId, toId]) if (!data.points[id]) next.points[id] = { ...next.points[id], type: 'bezierCorner' }
    writeSegmentControls(next, segment, world.map(p => inverse.applyToPoint(p)), allocate)
  }
  for (const id of ids) delete next.points[id]
  for (const h of Object.values(data.handles)) if (selected.has(h.pointId)) delete next.handles[h.id]
  for (const contour of Object.values(data.contours)) {
    if (!contour.pointIds.some(id => selected.has(id))) continue
    const pointIds: string[] = [], segmentIds: string[] = []
    contour.pointIds.forEach((id, i) => {
      const cut = cutMap.get(id)
      pointIds.push(...(cut ? bridgeIds.get(id)! : [id])); if (cut) segmentIds.push(...cut.segmentIds)
      if (contour.segmentIds[i]) segmentIds.push(contour.segmentIds[i])
    })
    next.contours[contour.id] = { ...contour, pointIds, segmentIds }
  }
  const output = markEditedSubShapes(data, next)
  assertSplineTopology(output); assertSplineLocks(data, output); validateCornerBoundaries(data, output, selected, matrix, label)
  return { data: output, cuts, path: transformPathDefinition(splineToPathDefinition(output), matrix), markers: cuts.flatMap(c => [matrix.applyToPoint(output.points[c.incomingId]), matrix.applyToPoint(output.points[c.outgoingId])]) }
}

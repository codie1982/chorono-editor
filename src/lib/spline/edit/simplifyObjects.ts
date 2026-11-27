import type { SplinePathData } from '../../types/spline'
import type { Vec2 } from '../../geometry/CoordinateSystem'
import { elevateBezierToCubic, trimBezier } from '../../geometry/bezier/curves'
import { bezierJet } from '../../geometry/bezier/derivatives'
import { segmentControls, writeSegmentControls } from '../corners/segmentGeometry'
import { retainSplineContours } from '../topology/records'
import { splineObjectSelection, validateSplineObjectEdit } from './objectSelection'

interface SourcePiece { controls: Vec2[]; from: number; to: number }
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)

/** Limiting oriented tangent survives endpoint handles at the anchor itself.
 * Null marks a degenerate piece; it is preserved rather than guessed away. */
function tangent(controls: Vec2[], end: boolean): Vec2 | null {
  const ordered = end ? [...controls].reverse() : controls, point = ordered[0], neighbor = ordered.slice(1).find(p => distance(p, point) > 1e-10)
  if (!neighbor) return null
  return end ? { x: point.x - neighbor.x, y: point.y - neighbor.y } : { x: neighbor.x - point.x, y: neighbor.y - point.y }
}

/** Preserve explicit independent-handle corners and sharp geometric turns
 * (>=30°). Small line-sampling turns may be reduced under the error bound;
 * pinning every generated Corner would prevent simplifying polygonal curves. */
function preserveCorner(data: SplinePathData, id: string, left: Vec2[], right: Vec2[]): boolean {
  if (data.points[id].type === 'bezierCorner') return true
  const a = tangent(left, true), b = tangent(right, false)
  if (!a || !b) return true
  return Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)) >= Math.PI / 6
}

/** Endpoint-tangent cubic coalescing. At an exact De Casteljau join, derivative
 * magnitude ratio recovers its split parameter. Otherwise the reconstructed
 * candidate is accepted only by the complete original-piece bound below. */
function candidate(left: Vec2[], right: Vec2[]) {
  const a = left[0], b = right.at(-1)!, da = bezierJet(left, 1).first, db = bezierJet(right, 0).first
  let l = Math.hypot(da.x, da.y), r = Math.hypot(db.x, db.y)
  if (l + r < 1e-10) { l = distance(a, left.at(-1)!); r = distance(right[0], b) }
  const t = l / (l + r)
  if (!Number.isFinite(t) || t <= 1e-8 || t >= 1 - 1e-8) return null
  if (left.length === 2 && right.length === 2) return { controls: [{ ...a }, { ...b }], t }
  const x = elevateBezierToCubic(left), y = elevateBezierToCubic(right)
  return { t, controls: [{ ...a }, { x: a.x + (x[1].x - a.x) / t, y: a.y + (x[1].y - a.y) / t },
    { x: b.x + (y[2].x - b.x) / (1 - t), y: b.y + (y[2].y - b.y) / (1 - t) }, { ...b }] }
}

/** Simplify whole selected Objects by bounded polynomial coalescing. This is
 * deliberately not animation RDP: that helper normalizes time/value samples and
 * cannot bound continuous Bézier geometry in local px. Source-piece parameter
 * maps survive every accepted merge, so errors are compared to the original
 * input (never accumulated from earlier approximations within this Apply).
 * Convex-hull control differences bound each entire original piece by tolerance.
 * Anchors retained by the result never move; open endpoints, closed seams,
 * >=30° corners, independent-handle corners, >=3 closed anchors, ownership and
 * hole roles are preserved. Curve pairs may elevate Q/line to cubic exactly.
 * Pure source, deterministic source-order scan; 500,000 control comparisons and
 * shared Object/boundary budgets refuse atomically. No removals return input. */
export function simplifySplineObjects(data: SplinePathData, objectIds: readonly string[], tolerancePx = .5): SplinePathData {
  if (!Number.isFinite(tolerancePx) || tolerancePx < .001 || tolerancePx > 1000) throw new Error('Simplify tolerance must be 0.001–1000 local px.')
  const selected = splineObjectSelection(data, objectIds)
  const next: SplinePathData = { ...data, points: { ...data.points }, handles: { ...data.handles }, segments: { ...data.segments }, contours: { ...data.contours } }
  let removed = 0, comparisons = 0
  for (const contourId of selected.contourIds) {
    const original = data.contours[contourId], minimum = original.closed ? 3 : 2
    const pointIds = [...original.pointIds], segmentIds = [...original.segmentIds], pieces = new Map<string, SourcePiece[]>()
    for (const id of segmentIds) pieces.set(id, [{ controls: elevateBezierToCubic(segmentControls(data, id)), from: 0, to: 1 }])
    let index = 1
    while (pointIds.length > minimum && index < pointIds.length - (original.closed ? 0 : 1)) {
      const id = pointIds[index], incoming = segmentIds[index - 1], outgoing = segmentIds[index]
      const left = segmentControls(next, incoming), right = segmentControls(next, outgoing)
      if (preserveCorner(data, id, left, right)) { index++; continue }
      const fit = candidate(left, right)
      if (!fit) { index++; continue }
      const source = [...pieces.get(incoming)!.map(p => ({ ...p, from: p.from * fit.t, to: p.to * fit.t })),
        ...pieces.get(outgoing)!.map(p => ({ ...p, from: fit.t + p.from * (1 - fit.t), to: fit.t + p.to * (1 - fit.t) }))]
      let accepted = true
      for (const piece of source) {
        const controls = elevateBezierToCubic(trimBezier(fit.controls, piece.from, piece.to))
        for (let i = 0; i < 4; i++) {
          if (++comparisons > 500000) throw new Error('Simplify work budget exceeded; select fewer points/Objects.')
          if (distance(controls[i], piece.controls[i]) > tolerancePx) { accepted = false; break }
        }
        if (!accepted) break
      }
      if (!accepted) { index++; continue }
      const merged = { ...next.segments[incoming], toPointId: next.segments[outgoing].toPointId, type: fit.controls.length === 2 ? 'line' as const : 'cubic' as const }
      delete merged.control1; delete merged.control2
      next.segments[incoming] = merged; delete next.segments[outgoing]; delete next.points[id]
      for (const handle of Object.values(next.handles)) if (handle.pointId === id) delete next.handles[handle.id]
      writeSegmentControls(next, merged, fit.controls)
      pointIds.splice(index, 1); segmentIds.splice(index, 1); pieces.set(incoming, source); pieces.delete(outgoing)
      removed++; index = Math.max(1, index - 1)
    }
    if (pointIds.length !== original.pointIds.length) next.contours[contourId] = { ...original, pointIds, segmentIds }
  }
  if (!removed) return data
  const result = retainSplineContours(next, next.contours)
  validateSplineObjectEdit(data, result, selected.objectIds, 'Simplify')
  return result
}

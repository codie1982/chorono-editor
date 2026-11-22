import type { ChronoScene } from '../../../types'
import type { OverrideMap } from '../../../evaluator'
import type { SplinePathData } from '../../../types/spline'
import { editableSplineLayer, drivenSplineTopologyReason } from '../../../spline/edit/authoringGuard'
import { assertSplineTopology } from '../../../spline/topology'
import { resolveLayerWorldMatrix } from '../../../geometry/resolveLayerWorldMatrix'
import { selectSplineCorners, type CornerSource } from '../../../spline/corners'
import { splineEditCommand } from '../editCommand'
import { assertSplineGeometryReferences } from '../geometryReferences'

/** Worker serialization copies all records; restore unchanged record identity
 * at the command boundary. IDs/connectivity remain ordinary portable source.
 * Never merge an old result into newer source: the plan rejects that separately. */
function adoptResult(before: SplinePathData, after: SplinePathData): SplinePathData {
  return { ...after,
    points: retainRecords(before.points, after.points), handles: retainRecords(before.handles, after.handles),
    segments: retainRecords(before.segments, after.segments), contours: retainRecords(before.contours, after.contours),
    subShapes: retainRecords(before.subShapes, after.subShapes) }

}
/** Reuse structurally unchanged source records without mutating either map. */
function retainRecords<T>(before: Record<string, T>, after: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(after).map(([id, value]) => [id, before[id] && JSON.stringify(before[id]) === JSON.stringify(value) ? before[id] : value]))
}

/** Shared native corner-edit ownership boundary. Preserve unrelated source,
 * transform/paint tracks and manual references. Exact captured scene identity
 * includes animated parent frame inputs. Preview is read-only; one command
 * commits the worker result and reuses unchanged source records after cloning. */
export function prepareSplineCornerEdit(scene: ChronoScene, layerId: string, ids: readonly string[], timeMs: number, overrides: OverrideMap | undefined, label: string, maxPoints = 128) {
  const layer = editableSplineLayer(scene, layerId), reason = drivenSplineTopologyReason(layer, scene)
  if (reason) throw new Error(reason)
  assertSplineTopology(layer.spline)
  const pointIds = selectSplineCorners(layer.spline, ids, label, maxPoints), matrix = resolveLayerWorldMatrix(layer, scene, timeMs, overrides)
  matrix.invert()
  const removed = new Set(pointIds)
  assertSplineGeometryReferences(scene, layerId, layer.spline, { ...layer.spline,
    points: Object.fromEntries(Object.entries(layer.spline.points).filter(([id]) => !removed.has(id))),
    handles: Object.fromEntries(Object.entries(layer.spline.handles).filter(([, h]) => !removed.has(h.pointId))) })
  const request: CornerSource = { data: layer.spline, pointIds, matrix: matrix.toArray() }
  return { request, command(result: { data: SplinePathData; cuts: { incomingId: string; outgoingId: string }[] }) {
    const next = adoptResult(layer.spline, result.data)
    const delegate = splineEditCommand(scene, layerId, { kind: 'topology' }, () => next, `${label} spline points`)
    if (!delegate) throw new Error(`${label} produced no changed corners.`)
    return { ids: result.cuts.flatMap(cut => [cut.incomingId, cut.outgoingId]), command: { label: delegate.label,
      execute(current: ChronoScene) {
        if (current !== scene) throw new Error(`Spline source changed. Preview ${label} again before Apply.`)
        return delegate.execute(current)
      }, undo: (current: ChronoScene) => delegate.undo(current) } }
  } }
}

import type { ChronoScene } from '../../types'
import type { OverrideMap } from '../../evaluator'
import type { SplineEditMode } from '../../spline/selection'
import { connectSplineEndpoints, copySplineObjects, deleteSplineObjects, deleteSplineEdges, deleteSplinePoints, divideSplineEdges } from '../../spline/topology'
import { insertPointOnSegment, reverseContour, setContourClosed } from '../../spline'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import { splineEditCommand } from './editCommand'

export interface SplineTopologyResult { layerId: string; mode: SplineEditMode; ids: string[] }
export type SplineTopologyAction = { kind: 'delete' } | { kind: 'copy'; x?: number; y?: number }
  | { kind: 'connect' | 'weld'; tolerancePx?: number }
  | { kind: 'refine'; t?: number; edgeId?: string } | { kind: 'divide'; parts?: number }
  | { kind: 'close' | 'open' | 'reverse' }
/** One source command for mode-owned topology. All selection IDs are scoped to
 * one layer and validated before allocation. Geometry ownership, ancestor locks,
 * source CAS and live references are rechecked by the native command. Effects,
 * outer animation and scene structure are untouched. Result IDs only guide UI
 * focus after commit; they are never serialized selection metadata. */
export function splineTopologyCommand(scene: ChronoScene, layerId: string, mode: SplineEditMode, ids: readonly string[],
  action: SplineTopologyAction, timeMs = 0, overrides?: OverrideMap) {
  const layer = scene.layers.find(item => item.id === layerId), before = layer?.spline
  if (!before || !ids.length) throw new Error('Select spline elements first.')
  const family = mode === 'point' ? before.points : mode === 'edge' ? before.segments : before.subShapes
  if (ids.some(id => !Object.hasOwn(family, id))) throw new Error('Spline selection changed. Select current elements again.')
  let result: SplineTopologyResult = { layerId, mode, ids: [...ids] }
  const command = splineEditCommand(scene, layerId, { kind: 'topology' }, data => {
    if (action.kind === 'delete') return mode === 'object' ? deleteSplineObjects(data, ids) : mode === 'edge' ? deleteSplineEdges(data, ids) : deleteSplinePoints(data, ids)
    if (action.kind === 'copy') {
      if (mode !== 'object') throw new Error('Copy objects in Object mode.')
      const copy = copySplineObjects(data, ids, action.x, action.y); result.ids = copy.objectIds; return copy.data
    }
    if (action.kind === 'connect' || action.kind === 'weld') {
      if (mode !== 'point' || ids.length !== 2) throw new Error('Select exactly two open endpoints in Point mode.')
      const next = connectSplineEndpoints(data, ids[0], ids[1], { weld: action.kind === 'weld', tolerancePx: action.tolerancePx,
        localToComposition: resolveLayerWorldMatrix(layer!, scene, timeMs, overrides) })
      result.ids = [ids[0]]; return next
    }
    if (action.kind === 'divide' || action.kind === 'refine') {
      if (mode !== 'edge') throw new Error('Select edges in Edge mode.')
      if (action.kind === 'refine' && action.edgeId && !ids.includes(action.edgeId)) throw new Error('Refine target is outside the selected edges.')
      const t = action.kind === 'refine' ? action.t ?? .5 : .5
      if (!Number.isFinite(t) || t <= 0 || t >= 1) throw new Error('Refine position must be between 0 and 100%, exclusively.')
      const next = action.kind === 'divide' ? divideSplineEdges(data, ids, action.parts)
        : (action.edgeId ? [action.edgeId] : ids).reduce((next, id) => insertPointOnSegment(next, id, t), data)
      result.ids = Object.keys(next.segments).filter(id => !data.segments[id]); return next
    }
    if (mode !== 'object') throw new Error('Select whole Objects to change contour closure/direction.')
    const contours = Array.from(new Set(ids.flatMap(id => data.subShapes[id].contourIds)))
    return contours.reduce((next, id) => action.kind === 'reverse' ? reverseContour(next, id) : setContourClosed(next, id, action.kind === 'close'), data)
  }, `Spline: ${action.kind}`)
  if (action.kind === 'delete') result.ids = []
  return { command, result }
}

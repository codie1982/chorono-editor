import type { ChronoScene } from '../../types'
import type { OverrideMap } from '../../evaluator'
import type { SplineEditMode } from '../../spline/selection'
import { connectSplineEndpoints, copySplineObjects, deleteSplineObjects, deleteSplineEdges, deleteSplinePoints, divideSplineEdges } from '../../spline/topology'
import { insertPointOnSegment, reverseContour, setContourClosed } from '../../spline'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import { splineEditCommand } from './editCommand'
import { breakSplinePoints, splitSplineEdges } from '../../spline/topology'
import { fuseSplinePoints, resetSplineTangents, pasteSplineTangents, type SplineTangents } from '../../spline/edit/tangents'
import { trimSplineAt } from '../../spline/topology/trim'
import { extendSplineToBoundary } from '../../spline/topology/extend'
import { readSplineEdgeBoundaries } from './edgeBoundaries'
import type { SplineEdgeBoundary } from '../../spline/topology/edgeBoundaries'
import { addSplineVertex, type SplineVertexType } from '../../spline/edit/addVertex'
import { simplifySplineObjects } from '../../spline/edit/simplifyObjects'
import { smoothSplineObjects } from '../../spline/edit/smoothObjects'

export interface SplineTopologyResult { layerId: string; mode: SplineEditMode; ids: string[]; reason?: string; pointId?: string }
export type SplineTopologyAction = { kind: 'delete' } | { kind: 'copy'; x?: number; y?: number }
  | { kind: 'connect' | 'weld'; tolerancePx?: number }
  | { kind: 'refine'; t?: number; edgeId?: string } | { kind: 'divide'; parts?: number }
  | { kind: 'close' | 'open' | 'reverse' }
  | { kind: 'break' } | { kind: 'fuse' } | { kind: 'resetTangents' }
  | { kind: 'pasteTangents'; tangents: SplineTangents }
  | { kind: 'split'; t?: number; edgeId?: string }
  | { kind: 'trim' | 'extend'; edgeId: string; t: number }
  | { kind: 'addVertex'; edgeId: string; t: number; pointType?: SplineVertexType }
  | { kind: 'simplify'; tolerancePx?: number } | { kind: 'smooth' }
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
  let boundaries: SplineEdgeBoundary[] | undefined
  const command = splineEditCommand(scene, layerId, { kind: 'topology' }, data => {
    if (action.kind === 'simplify' || action.kind === 'smooth') {
      if (mode !== 'object') throw new Error('Use Simplify/Smooth on selected spline Objects in Object mode.')
      return action.kind === 'simplify' ? simplifySplineObjects(data, ids, action.tolerancePx) : smoothSplineObjects(data, ids)
    }
    if (action.kind === 'addVertex') {
      if (mode !== 'edge' || !ids.includes(action.edgeId)) throw new Error('Add Vertex needs an explicitly selected Edge target.')
      const added = addSplineVertex(data, action.edgeId, action.t, action.pointType)
      result.ids = added.edgeIds; result.pointId = added.pointId; return added.data
    }
    if (action.kind === 'trim' || action.kind === 'extend') {
      if (mode !== 'edge') throw new Error('Use Trim/Extend in Edge mode.')
      if (!ids.includes(action.edgeId)) throw new Error('Trim/Extend target is outside the selected edges.')
      boundaries = readSplineEdgeBoundaries(scene, layer!, timeMs, overrides)
      const output = action.kind === 'trim' ? trimSplineAt(data, action.edgeId, action.t, boundaries) : extendSplineToBoundary(data, action.edgeId, action.t, boundaries)
      result.ids = output.edgeIds; result.reason = output.reason; return output.data
    }
    if (action.kind === 'break' || action.kind === 'fuse' || action.kind === 'resetTangents' || action.kind === 'pasteTangents') {
      if (mode !== 'point') throw new Error('Use this point tool in Point mode.')
      if (action.kind === 'break') { const cut = breakSplinePoints(data, ids); result.ids = cut.pointIds; return cut.data }
      return action.kind === 'fuse' ? fuseSplinePoints(data, ids) : action.kind === 'resetTangents' ? resetSplineTangents(data, ids) : pasteSplineTangents(data, ids, action.tangents)
    }
    if (action.kind === 'split') {
      if (mode !== 'edge') throw new Error('Use Split in Edge mode.')
      if (action.edgeId && !ids.includes(action.edgeId)) throw new Error('Split target is outside the selected edges.')
      const cut = splitSplineEdges(data, action.edgeId ? [action.edgeId] : ids, action.t); result.ids = cut.edgeIds; return cut.data
    }
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
  if (!command || !boundaries) return { command, result }
  const signature = JSON.stringify(boundaries), timelineSignature = JSON.stringify(scene.timelines)
  return { result, command: { ...command, execute: (current: ChronoScene) => {
    const target = current.layers.find(item => item.id === layerId)
    if (!target?.spline || JSON.stringify(current.timelines) !== timelineSignature || JSON.stringify(readSplineEdgeBoundaries(current, target, timeMs, overrides)) !== signature)
      throw new Error('Spline intersection boundaries changed. Pick the current edge again.')
    return command.execute(current)
  } } }
}

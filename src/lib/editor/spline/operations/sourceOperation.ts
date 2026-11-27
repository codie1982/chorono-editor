import type { ChronoScene } from '../../../types'
import type { OverrideMap } from '../../../evaluator'
import { createSplinePrimitive, transformSplineData, appendSplineObjects, moveSplinePoint, setSplinePointType, setSegmentType } from '../../../spline'
import { Matrix2D } from '../../../geometry/Matrix2D'
import { splineSelectionPoints, transformSplineSelection } from '../../../spline/selection'
import { editableSplineLayer } from '../../../spline/edit/authoringGuard'
import { drivenChannelReason } from '../../../timeline/authoring/keyableChannels'
import { hasNativeExpressionOwner } from '../../inputExpressions/ExpressionAuthoringGuard'
import { makeUpdateLayerCmd } from '../../commands-layer'
import { splineEditCommand } from '../editCommand'
import { splineTopologyCommand } from '../topologyCommand'
import { attachSplineLayerCommand, detachSplineObjectsCommand } from '../transferCommand'
import { drawSplineLine } from './drawLine'
import type { SplineSelection, SplineSourceOperation } from './types'
import { assertSplineOperation } from './validateOperation'

/** Refuse wrong-mode/stale IDs instead of silently ignoring a missing selection.
 * Input order is retained for endpoint ownership and Object copy semantics. */
function selection(scene: ChronoScene, layerId: string, target: SplineSelection) {
  const data = editableSplineLayer(scene, layerId).spline
  const family = target?.mode === 'point' ? data.points : target?.mode === 'edge' ? data.segments : target?.mode === 'object' ? data.subShapes : undefined
  if (!family || !Array.isArray(target.ids) || !target.ids.length || new Set(target.ids).size !== target.ids.length || target.ids.some(id => !Object.hasOwn(family, id))) throw new Error('Choose unique, existing IDs in the explicit Point/Edge/Object mode.')
  return data
}
/** One synchronous native command for simple source operations. Reused by
 * headless MCP plans and isolated SplineHandle.edit. Solvers are deliberately
 * excluded from the synchronous scripting surface. No history is touched until
 * the owning caller executes the returned command. Positions are layer-local. */
export function prepareSplineSourceOperation(scene: ChronoScene, layerId: string, operation: SplineSourceOperation, timeMs = 0, overrides?: OverrideMap) {
  assertSplineOperation(operation)
  const layer = editableSplineLayer(scene, layerId)
  if (operation.kind === 'topology') { selection(scene, layerId, operation.selection); return splineTopologyCommand(scene, layerId, operation.selection.mode, operation.selection.ids, operation.action, timeMs, overrides) }
  if (operation.kind === 'attach') return attachSplineLayerCommand(scene, layerId, operation.sourceLayerId, timeMs, overrides)
  if (operation.kind === 'detach') return detachSplineObjectsCommand(scene, layerId, operation.objectIds)
  if (operation.kind === 'paint') {
    const fields = ['fill', 'stroke'].filter(key => Object.hasOwn(operation, key))
    if (!fields.length) throw new Error('Supply fill and/or stroke; omitted paint stays unchanged.')
    for (const field of fields) { const path = `style.${field}`, reason = drivenChannelReason(scene, layer, path)
      if (reason || hasNativeExpressionOwner(scene, layerId, path)) throw new Error(reason ?? 'Edit driven paint through its authored animation/expression.') }
    const { kind: _kind, ...patch } = operation
    return { command: makeUpdateLayerCmd(layerId, { style: { ...layer.style, ...patch } }, layer), result: { layerId } }
  }
  if (operation.kind === 'append') {
    if (![operation.x ?? 0, operation.y ?? 0].every(Number.isFinite)) throw new Error('Append placement must be finite local px.')
    const generated = createSplinePrimitive({ kind: operation.primitive, params: operation.params })
    if (!generated) throw new Error('Unsupported spline primitive.')
    const incoming = transformSplineData(generated, Matrix2D.translation(operation.x ?? 0, operation.y ?? 0))
    if (operation.name) for (const object of Object.values(incoming.subShapes)) object.name = operation.name
    const appended = appendSplineObjects(layer.spline, incoming)
    return { command: splineEditCommand(scene, layerId, { kind: 'metadata' }, () => appended.data, 'Append spline object'), result: { layerId, mode: 'object', ids: appended.objectIds } }
  }
  if (operation.kind === 'draw') {
    const output = drawSplineLine(layer.spline, operation.points, operation)
    return { command: splineEditCommand(scene, layerId, operation.startPointId ? { kind: 'topology' } : { kind: 'metadata' }, () => output.data, 'Draw spline line'), result: { layerId, mode: output.mode, ids: output.ids } }
  }
  if (operation.kind === 'transform') {
    const data = selection(scene, layerId, operation.selection), points = splineSelectionPoints(data, operation.selection.mode, operation.selection.ids)
    return { command: splineEditCommand(scene, layerId, { kind: 'geometry', ids: Array.from(points) }, source => transformSplineSelection(source, points, operation.transform), 'Transform spline selection'), result: { layerId, ...operation.selection } }
  }
  if (operation.kind === 'movePoint') {
    selection(scene, layerId, { mode: 'point', ids: [operation.pointId] })
    if (![operation.x, operation.y].every(Number.isFinite)) throw new Error('Point coordinates must be finite local px.')
    return { command: splineEditCommand(scene, layerId, { kind: 'point', ids: [operation.pointId] }, data => moveSplinePoint(data, operation.pointId, operation.x, operation.y)), result: { layerId, pointId: operation.pointId } }
  }
  if (operation.kind === 'pointType' || operation.kind === 'edgeType') {
    const point = operation.kind === 'pointType', ids = point ? operation.pointIds : operation.edgeIds
    selection(scene, layerId, { mode: point ? 'point' : 'edge', ids })
    if (point ? !['corner', 'smooth', 'bezier', 'bezierCorner'].includes(operation.pointType) : !['line', 'cubic'].includes(operation.edgeType)) throw new Error('Invalid spline point/edge type.')
    return { command: splineEditCommand(scene, layerId, { kind: 'topology' }, data => ids.reduce((next, id) => operation.kind === 'pointType' ? setSplinePointType(next, id, operation.pointType) : setSegmentType(next, id, operation.edgeType), data)), result: { layerId, ids } }
  }
  throw new Error('Unsupported synchronous spline operation; solvers use prepare_spline_edit.')
}

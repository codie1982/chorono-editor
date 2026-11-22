import type { ChronoScene } from '../../types'
import type { OverrideMap } from '../../evaluator'
import type { EditorCommand } from '../commands-keyframe'
import { prepareCloneForest } from '../commands-clone-forest'
import { makeUpdateLayerCmd, makeDeleteLayerCmd } from '../commands-layer'
import { makeBatchCmd } from '../commands-batch'
import { assertSplineTopology, extractSplineObjects, deleteSplineObjects, remapSplineData, markEditedSubShapes } from '../../spline/topology'
import { appendSplineObjects, transformSplineData } from '../../spline'
import { editableSplineLayer, drivenSplineTopologyReason } from '../../spline/edit/authoringGuard'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'
import { splineEditCommand } from './editCommand'
import { assertSplineGeometryReferences } from './geometryReferences'
import { assertAttachSourceUnreferenced, assertStaticSplineTransformChain, assertAttachAncestorPresentation } from './transferGuards'
import type { SplineTopologyResult } from './topologyCommand'

/** Detach whole Objects into one sibling spline layer. The existing forest
 * clone contract copies outer tracks/controllers with collision-safe layer/key
 * IDs across all timelines, preserving parent, style and timing. Geometry IDs
 * move intact to the new layer; unrelated Objects/keys remain in the old layer.
 * Children and geometry drivers/readers refuse (no guessed graph migration).
 * One native batch owns source removal + clone + one Undo/Redo. No resources. */
export function detachSplineObjectsCommand(scene: ChronoScene, layerId: string, ids: readonly string[]) {
  const layer = editableSplineLayer(scene, layerId)
  if (!ids.length) throw new Error('Select Objects to detach.')
  if (Object.keys(layer.inputExpressions?.fields ?? {}).some(path => propertyPathsOverlap(path, 'spline'))) throw new Error('Detach keeps geometry formulas in their current layer. Explicitly convert those source recipes before moving Objects.')
  if (scene.layers.some(item => item.parentId === layerId)) throw new Error('Detach requires a spline without child layers. Keep the existing child hierarchy intact.')
  const extracted = extractSplineObjects(layer.spline, ids), remaining = deleteSplineObjects(layer.spline, ids)
  assertSplineGeometryReferences(scene, layerId, layer.spline, remaining)
  const update = splineEditCommand(scene, layerId, { kind: 'topology' }, () => remaining, 'Detach spline objects')
  const clone = prepareCloneForest(scene, { sourceIds: [layerId], mode: 'copy' }).atOffsets({ [layerId]: { x: 0, y: 0 } })
  const clonedScene = clone.execute(scene), cloneId = clone.result.createdLayerIds[0], cloned = clonedScene.layers.find(item => item.id === cloneId)!
  if (clone.result.createdLayerIds.length !== 1 || !cloned) throw new Error('Detach requires one independent sibling layer.')
  const command = makeBatchCmd('Detach spline objects', [clone, makeUpdateLayerCmd(cloneId, { spline: extracted, name: `${layer.name} · detached` }, cloned), ...(update ? [update] : [])])
  return { command, result: { layerId: cloneId, mode: 'object', ids: Object.keys(extracted.subShapes) } as SplineTopologyResult }
}

/** Attach consumes one static, unreferenced source spline into the active
 * target, using target.inverse × source.world once. Target IDs/paint/animation
 * stay authoritative. Incoming ID collisions are remapped with explicit maps.
 * Source style is deliberately replaced by the active layer's shared paint;
 * extra effects, opacity, relationships and live channels refuse. Execution
 * guards the captured semantic scene signature because either transform/reference graph
 * could change without changing source geometry. One Undo restores both layers.
 */
export function attachSplineLayerCommand(scene: ChronoScene, targetId: string, sourceId: string, timeMs = 0, overrides?: OverrideMap) {
  if (sourceId === targetId) throw new Error('Choose another spline layer to Attach.')
  const target = editableSplineLayer(scene, targetId), source = editableSplineLayer(scene, sourceId)
  assertStaticSplineTransformChain(scene, source); assertStaticSplineTransformChain(scene, target)
  assertAttachAncestorPresentation(scene, source, target)
  if ((source.startMs ?? 0) !== (target.startMs ?? 0) || (source.endMs ?? scene.composition.durationMs) !== (target.endMs ?? scene.composition.durationMs)) throw new Error('Attach requires matching layer time ranges. Keep the existing timing or explicitly align the ranges first.')
  const reason = drivenSplineTopologyReason(source, scene)
  if (reason) throw new Error(reason)
  if (scene.layers.some(layer => layer.parentId === sourceId)) throw new Error('The Attach source has child layers. Keep that hierarchy separate.')
  if (source.opacity !== 1 || source.blendMode && source.blendMode !== 'source-over' || Object.keys(source.effects ?? {}).length || source.effectsChain?.length || source.masks?.length || source.repeater || source.motionBlur || source.pathStroke
    || source.tappable || source.draggable || source.dragConfig || source.solo || source.inputExpressions
    || Object.keys(source.paramBindings ?? {}).length || source.propertyExpressions) throw new Error('Attach supports plain spline geometry. Keep opacity/effects/live presentation separate or explicitly bake first.')
  assertAttachSourceUnreferenced(scene, sourceId)
  assertSplineTopology(source.spline)
  if (!Object.keys(source.spline.subShapes).length) throw new Error('The Attach source has no Objects.')
  const matrix = resolveLayerWorldMatrix(target, scene, timeMs, overrides).invert().multiply(resolveLayerWorldMatrix(source, scene, timeMs, overrides))
  const remapped = remapSplineData(source.spline, target.spline)
  const appended = appendSplineObjects(target.spline, markEditedSubShapes(remapped.data, transformSplineData(remapped.data, matrix)))
  const update = splineEditCommand(scene, targetId, { kind: 'topology' }, () => appended.data, 'Attach spline layer')
  const batch = makeBatchCmd('Attach spline layer', [...(update ? [update] : []), makeDeleteLayerCmd(source)])
  const signature = JSON.stringify({ ...scene, authoring: undefined })
  const command: EditorCommand = { label: batch.label, execute: current => {
    if (JSON.stringify({ ...current, authoring: undefined }) !== signature) throw new Error('Scene changed during Attach. Choose the current source again.')
    return batch.execute(current)
  }, undo: current => batch.undo(current) }
  return { command, result: { layerId: targetId, mode: 'object', ids: appended.objectIds } as SplineTopologyResult, idMaps: remapped.maps }
}

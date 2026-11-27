import type { ChronoScene } from '../../types'
import type { OverrideMap } from '../../evaluator'
import type { EditorCommand } from '../commands-keyframe'
import { assertLayerUnreferenced } from '../../scene/references/assertLayerUnreferenced'
import { assertStaticTransform, localTransform } from '../branches/WorldPlacement'
import { layerTransformMatrix } from '../../geometry/layerTransformMatrix'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import { layerBooleanOperand } from '../../geometry/boolean/layerOperand'
import { pathToSvgString } from '../../geometry'
import { transformSplineData } from '../../spline/geometry/transformSplineData'
import { booleanOwner } from './operationPlan'
import { booleanSceneCommand, makeMergeBooleanPathsCmd } from './operationCommands'

/** Transient viewport evidence. Paths/matrices are detached at explicit Apply;
 * no scene, runtime resources or source arrays are retained or serialized. */
export interface SplineSourceGhost { readonly path: string; readonly matrix: readonly number[] }

/** Collapse a Boolean parent into its editable spline result, retaining the
 * PARENT id, transform, outer animation and selection identity. The generated
 * child disappears. Reuse the canonical Merge evaluation; bake its static local
 * affine into geometry. Unconsumed source Objects become ordinary siblings via
 * the existing strict reparent converter. Result readers/animation or animated
 * owners with remaining children refuse rather than lose links or motion.
 * One exact-snapshot command/Undo, with unchanged unrelated layers/recipes. */
export function makeCollapseBooleanPathsCmd(scene: ChronoScene, ownerId: string) {
  const owner = scene.layers.find(layer => layer.id === ownerId && layer.booleanOperation)
  if (!owner) throw new Error('Select a Boolean operation to merge.')
  const outputId = owner.booleanOperation!.resultLayerId
  const merge = makeMergeBooleanPathsCmd(scene, ownerId), merged = merge.command.execute(scene)
  const output = merged.layers.find(layer => layer.id === outputId)!
  assertLayerUnreferenced(merged, outputId, 'The generated result has animation or readers. Bake or remove those links before collapsing its parent.')
  assertStaticTransform(merged, [outputId])
  const exhausted = new Set(merged.layers.filter(layer => layer.parentId === ownerId && layer.id !== outputId && layer.spline && !Object.keys(layer.spline.contours).length).map(layer => layer.id))
  for (const id of Array.from(exhausted)) assertLayerUnreferenced(merged, id, 'An exhausted source has animation or readers. Remove those links before merging.')
  const remaining = merged.layers.filter(layer => layer.parentId === ownerId && layer.id !== outputId && !exhausted.has(layer.id))
  if (remaining.length) assertStaticTransform(merged, [ownerId])
  const parentMatrix = layerTransformMatrix(owner.transform)
  const spline = transformSplineData(output.spline!, layerTransformMatrix(output.transform))
  const layer = { ...owner, type: 'spline' as const, spline, style: output.style,
    opacity: owner.opacity * output.opacity, booleanOperation: undefined, booleanResultFor: undefined,
    modifierStack: undefined, geometryConversion: undefined }
  const next = { ...merged, layers: merged.layers.filter(item => item.id !== outputId && !exhausted.has(item.id)).map(item => item.id === ownerId ? layer
    : item.parentId === ownerId ? { ...item, parentId: owner.parentId,
      transform: localTransform(parentMatrix.multiply(layerTransformMatrix(item.transform)), item.transform) } : item),
    timelines: merged.timelines.map(timeline => ({ ...timeline, layerIds: timeline.layerIds?.filter(id => id !== outputId && !exhausted.has(id)) })) }
  return { layerId: ownerId, command: booleanSceneCommand(scene, next, 'Merge Boolean into spline') }
}

/** Add Spline's immediate area operation: canonical solve → parent collapse in
 * ONE Undo. Explicit Boolean Preview continues to own its non-destructive recipe
 * path. Capture input ghosts before collapse; after commit callers focus this
 * editable parent and preserve their Add policy. Curves are tolerance-sampled
 * by the existing solver; Undo restores exact original Béziers and identities. */
export function materializeSplineBoolean(scene: ChronoScene, prepared: EditorCommand | null, targetId: string,
  timeMs = 0, overrides: OverrideMap = new Map()) {
  const candidate = prepared?.execute(scene) ?? scene, owner = booleanOwner(candidate, targetId)
  if (!owner?.booleanOperation) throw new Error('The Boolean result is no longer available.')
  const ghosts: SplineSourceGhost[] = owner.booleanOperation.inputs.map(input => {
    const layer = candidate.layers.find(item => item.id === input.layerId)!
    return { path: pathToSvgString(layerBooleanOperand(layer, input.subShapeId).path),
      matrix: resolveLayerWorldMatrix(layer, candidate, timeMs, overrides).toArray() }
  })
  const collapsed = makeCollapseBooleanPathsCmd(candidate, owner.id), next = collapsed.command.execute(candidate)
  const layer = next.layers.find(item => item.id === collapsed.layerId)!
  return { layerId: layer.id, ids: Object.keys(layer.spline!.subShapes), ghosts,
    command: booleanSceneCommand(scene, next, `${owner.booleanOperation.operation} spline Objects`) }
}

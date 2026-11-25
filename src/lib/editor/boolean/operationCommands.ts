import type { ChronoScene, Layer } from '../../types'
import type { EditorCommand } from '../commands-keyframe'
import { assertBooleanOperation, assertSceneBooleanOperations } from '../../booleanOperations/validation'
import { evaluateBooleanOperation } from '../../booleanOperations/evaluateOperation'
import { removeSplineContours } from '../../spline/topology'
import { assertLayerAncestors } from '../../scene/hierarchy/assertLayerAncestors'
import { assertLayerUnreferenced } from '../../scene/references/assertLayerUnreferenced'

/** Resolve an editable recipe and its complete ancestor protection. Borrows the
 * source, validates ownership and never repairs malformed/locked hierarchies. */
export function editableBooleanOwner(scene: ChronoScene, id: string): Layer & { booleanOperation: NonNullable<Layer['booleanOperation']> } {
  const owner = scene.layers.find(layer => layer.id === id)
  if (!owner?.booleanOperation) throw new Error('Select an existing Boolean operation.')
  assertBooleanOperation(scene, owner); assertLayerAncestors(scene, owner, { editable: true })
  return owner as Layer & { booleanOperation: NonNullable<Layer['booleanOperation']> }
}

/** Atomic Boolean source replacement. Exact-snapshot admission prevents stale
 * UI plans from replacing edits; Undo/Redo retains all original IDs and keys. */
export function booleanSceneCommand(scene: ChronoScene, next: ChronoScene, label: string): EditorCommand {
  assertSceneBooleanOperations(next)
  return { label, execute(current) {
    if (current !== scene) throw new Error('Scene changed. Repeat the Boolean action on current sources.')
    return next
  }, undo: () => scene }
}

/** Materialize ONE recipe into editable spline records, preserving its group,
 * result ID/TRS/paint/animation and any unconsumed source Objects. Other recipes
 * remain recipes. Uses the canonical bounded evaluation (tolerance-sampled line
 * segments, not exact recovered Bézier handles). Holes/islands/empty are valid.
 * One Undo restores the recipe and untouched original sources. No resources. */
export function makeMergeBooleanPathsCmd(scene: ChronoScene, ownerId: string) {
  const owner = editableBooleanOwner(scene, ownerId), recipe = owner.booleanOperation
  const data = evaluateBooleanOperation(scene, recipe).spline
  const spline = { ...data, subShapes: Object.fromEntries(Object.entries(data.subShapes).map(([id, sub]) => [id, { ...sub, editable: true, source: 'edited' as const }])) }
  const removed = new Set<string>()
  const layers = scene.layers.flatMap(layer => {
    if (layer.id === owner.id) return [{ ...layer, booleanOperation: undefined }]
    if (layer.id === recipe.resultLayerId) return [{ ...layer, spline, booleanResultFor: undefined }]
    const inputs = recipe.inputs.filter(input => input.layerId === layer.id)
    if (!inputs.length) return [layer]
    if (inputs.some(input => !input.subShapeId)) { removed.add(layer.id); return [] }
    return [{ ...layer, spline: removeSplineContours(layer.spline!, new Set(inputs.flatMap(input => layer.spline!.subShapes[input.subShapeId!].contourIds))) }]
  })
  const next = { ...scene, layers, timelines: scene.timelines.map(timeline => ({ ...timeline, layerIds: timeline.layerIds?.filter(id => !removed.has(id)) })) }
  return { command: booleanSceneCommand(scene, next, 'Merge Boolean paths'), layerId: recipe.resultLayerId }
}

/** Release a recipe back to its unchanged original components in the same
 * ordinary group. Keeps outer animation and source IDs; refuses live readers
 * of the removed result instead of silently deleting their links or keys. */
export function makeSeparateBooleanInputsCmd(scene: ChronoScene, ownerId: string) {
  const owner = editableBooleanOwner(scene, ownerId), recipe = owner.booleanOperation
  const unowned = { ...scene, layers: scene.layers.map(layer => layer.id === owner.id ? { ...layer, booleanOperation: undefined } : layer) }
  assertLayerUnreferenced(unowned, recipe.resultLayerId, 'The Boolean result has readers or animation. Keep it or remove those links before separating inputs.')
  const next = { ...unowned, layers: unowned.layers.filter(layer => layer.id !== recipe.resultLayerId),
    timelines: scene.timelines.map(timeline => ({ ...timeline, layerIds: timeline.layerIds?.filter(id => id !== recipe.resultLayerId) })) }
  return { command: booleanSceneCommand(scene, next, 'Separate Boolean inputs'), layerId: recipe.inputs[0].layerId }
}

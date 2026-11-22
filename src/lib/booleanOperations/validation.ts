import { BOOLEAN_SCENE_LIMITS } from './limits'
import { assertLayerAncestors } from '../scene/hierarchy/assertLayerAncestors'
import { assertLayerUnreferenced } from '../scene/references/assertLayerUnreferenced'
import type { ChronoScene, Layer } from '../types'
import type { BooleanOperationData } from '../types/booleanOperation'
import { Matrix2D } from '../geometry/Matrix2D'
import { BOOLEAN_LIMITS } from '../geometry/boolean/types'

/** Validate finite, bounded v1 source without conversion/clipping. Actual
 * geometry admission stays in the shared operand adapter and solver. */
export function assertBooleanRecipe(value: BooleanOperationData): void {
  if (!value || value.version !== 1 || !['union', 'subtract', 'intersect'].includes(value.operation) || typeof value.reverse !== 'boolean'
    || !Number.isFinite(value.tolerancePx) || value.tolerancePx < .01 || value.tolerancePx > 10
    || !Array.isArray(value.sampling) || value.sampling.length !== 4 || value.sampling.some(n => !Number.isFinite(n) || Math.abs(n) > 1e5)
    || Math.abs(new Matrix2D(...value.sampling, 0, 0).determinant()) < 1e-9) throw new Error('Invalid or unsupported Boolean recipe v1.')
  const validId = (id: unknown) => typeof id === 'string' && /^[\w-]{1,128}$/.test(id)
  if (!validId(value.resultLayerId) || !Array.isArray(value.inputs) || value.inputs.length < 2 || value.inputs.length > BOOLEAN_LIMITS.operands) throw new Error('A Boolean recipe requires 2–8 inputs and a result layer.')
  const seen = new Set<string>(), layers = new Map<string, boolean>()
  for (const input of value.inputs) {
    if (!input || !validId(input.layerId) || input.subShapeId !== undefined && !validId(input.subShapeId)) throw new Error('Invalid Boolean input reference.')
    const key = `${input.layerId}:${input.subShapeId ?? ''}`
    if (seen.has(key) || input.layerId === value.resultLayerId || layers.has(input.layerId) && (!input.subShapeId || !layers.get(input.layerId))) throw new Error('Duplicate or overlapping Boolean inputs.')
    seen.add(key); layers.set(input.layerId, !!input.subShapeId)
  }
}

/** Reject competing geometry/presentation writers instead of baking a single
 * animated input pose. A shared parent/Boolean group may still animate normally.
 * Static source geometry can be edited and re-evaluated; result geometry cannot
 * be independently keyed. This policy includes muted/empty timeline tracks. */
export function assertStaticBooleanInput(scene: ChronoScene, layer: Layer): void {
  if (!['shape', 'spline'].includes(layer.type) || layer.instanceOf || layer.booleanResultFor || layer.booleanOperation || layer.motionPath || layer.followPath
    || layer.hidden || layer.locked || layer.frozen || layer.solo || layer.masks?.length || layer.effectsChain?.length || layer.motionBlur
    || Object.keys(layer.effects ?? {}).length || Object.keys(layer.propertyExpressions?.fields ?? {}).length || Object.keys(layer.paramBindings ?? {}).length)
    throw new Error('Apply Boolean requires visible, unlocked source shapes/splines without instances, constraints, effects or live drivers.')
  if (scene.layers.some(item => item.parentId === layer.id)) throw new Error('Boolean input layers cannot own child layers in this version.')
  if (scene.timelines.some(tl => tl.tracks.some(track => track.target.startsWith(`layers.${layer.id}.`)))
    || scene.parameterWires?.some(wire => wire.target.layerId === layer.id)
    || scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === layer.id))
    throw new Error('Independent animated/bound inputs cannot be flattened into a Boolean result. Keep their keys or explicitly bake a static source first.')
}

/** Check structural ownership, lifetime and native-key restrictions without
 * changing source. Call on load/commit/export; viewport catches diagnostics.
 * Recipes cannot nest or borrow another group's source/result. */
export function assertBooleanOperation(scene: ChronoScene, owner: Layer): void {
  const recipe = owner.booleanOperation
  if (!recipe) return
  assertBooleanRecipe(recipe)
  assertLayerAncestors(scene, owner)
  if (owner.type !== 'group' || owner.instanceOf) throw new Error('A Boolean operation belongs to an independent group.')
  const output = scene.layers.find(layer => layer.id === recipe.resultLayerId)
  if (!output || output.type !== 'spline' || output.parentId !== owner.id || output.booleanResultFor !== owner.id || output.instanceOf) throw new Error('The Boolean result child is missing or moved.')
  if (scene.layers.some(layer => layer.parentId === output.id)) throw new Error('A generated Boolean result cannot own children.')
  if (!output.spline || (['points', 'handles', 'segments', 'contours', 'subShapes'] as const).some(key => Object.keys(output.spline![key]).length)) throw new Error('Generated Boolean source must be an empty placeholder; use Edit Operation.')
  const unowned = { ...scene, layers: scene.layers.map(layer => layer.id === owner.id ? { ...layer, booleanOperation: undefined } : layer) }
  const ids = new Set(recipe.inputs.map(input => input.layerId))
  if (scene.layers.some(layer => layer.parentId === owner.id && layer.id !== output.id && !ids.has(layer.id))) throw new Error('Move unrelated children outside the Boolean operation group.')
  for (const id of Array.from(ids)) {
    const layer = scene.layers.find(item => item.id === id)
    if (!layer || layer.parentId !== owner.id) throw new Error('A Boolean source is missing or moved. Restore its original ID and parent.')
    assertStaticBooleanInput(scene, layer)
    assertLayerUnreferenced(unowned, id, 'A protected Boolean input has an external reader. Reference the operation/result instead.')
    if ((layer.startMs ?? 0) !== (owner.startMs ?? 0) || (layer.endMs ?? scene.composition.durationMs) !== (owner.endMs ?? scene.composition.durationMs)) throw new Error('Boolean inputs and operation must share the same lifetime.')
    for (const input of recipe.inputs.filter(item => item.layerId === id)) if (input.subShapeId && !layer.spline?.subShapes[input.subShapeId]) throw new Error('A Boolean source Object no longer exists.')
  }
  if (scene.timelines.some(tl => tl.tracks.some(track => track.target.startsWith(`layers.${output.id}.spline`)))
    || Object.keys(output.propertyExpressions?.fields ?? {}).some(path => path.startsWith('spline'))
    || scene.parameterWires?.some(wire => wire.target.layerId === output.id && wire.target.propertyPath?.startsWith('spline'))
    || scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === output.id && binding.target.property?.startsWith('spline')))
    throw new Error('Generated Boolean topology cannot receive point/handle animation. Animate the result transform or group instead.')
}

/** Strict boundary validation; legacy scenes without recipes are untouched. */
export function assertSceneBooleanOperations(scene: ChronoScene): void {
  if (scene.layers.filter(layer => layer.booleanOperation).length > BOOLEAN_SCENE_LIMITS.operations) throw new Error('Boolean operation limit exceeded: at most 64 operations per scene.')
  assertBooleanInstanceLinks(scene)
  const used = new Set<string>()
  for (const layer of scene.layers) if (layer.booleanOperation) {
    assertBooleanOperation(scene, layer)
    for (const id of Array.from(new Set(layer.booleanOperation.inputs.map(input => input.layerId)))) {
      if (used.has(id)) throw new Error('A Boolean input cannot be owned by multiple operations.')
      used.add(id)
    }
  }
  for (const layer of scene.layers) if (layer.booleanResultFor && !scene.layers.some(owner => owner.id === layer.booleanResultFor && owner.booleanOperation?.resultLayerId === layer.id)) throw new Error('Orphan generated Boolean result.')
}

/** Reject thin links to operation members at source admission as well as the
 * native Copy UI; ordinary independent appearance instances are unchanged. */
export function assertBooleanInstanceLinks(scene: ChronoScene): void {
  const protectedIds = new Set(scene.layers.flatMap(layer => layer.booleanOperation ? [layer.id, layer.booleanOperation.resultLayerId, ...layer.booleanOperation.inputs.map(input => input.layerId)] : []))
  if (!protectedIds.size) return
  for (const layer of scene.layers) {
    let sourceId = layer.instanceOf
    const seen = new Set<string>()
    while (sourceId && !seen.has(sourceId)) {
      if (protectedIds.has(sourceId)) throw new Error('Boolean operation members require independent whole-group Copy, not linked Instance.')
      seen.add(sourceId); sourceId = scene.layers.find(source => source.id === sourceId)?.instanceOf
    }
  }
}

import type { ChronoScene } from '../../types'
import type { OverrideMap } from '../../evaluator'
import { PolygonClippingBackend, type BooleanOperation } from '../../geometry/boolean'
import { layerTransformMatrix } from '../../geometry/layerTransformMatrix'
import { assertStaticTransform, localTransform } from '../branches/WorldPlacement'
import { hasNativeExpressionOwner } from '../inputExpressions/ExpressionAuthoringGuard'
import { assertLayerUnreferenced } from '../../scene/references/assertLayerUnreferenced'
import { assertStaticBooleanInput } from '../../booleanOperations/validation'
import { booleanOwner, prepareBooleanOperation } from './operationPlan'
import { booleanSceneCommand, editableBooleanOwner } from './operationCommands'

const backend = new PolygonClippingBackend()

/** Existing-layer pick → the canonical persisted Boolean recipe. First pick
 * creates the usual owned group; later picks extend it without nested recipes.
 * Target A remains selected/editable and every original source is retained.
 * B is the remaining inputs (Subtract: A − union(B); XOR: parity of all inputs).
 * Uses the same bounded solver as preview/cold load, synchronously once per
 * explicit native command, never per pointer move. No parallel geometry path.
 * Same-parent adjacent siblings preserve stacking; static owner TRS admission
 * and the shared reparent converter preserve world placement or reject shear.
 * Changing an existing operation's type applies to all of its original inputs. */
export function makePickBooleanCmd(scene: ChronoScene, targetId: string, sourceId: string, operation: BooleanOperation,
  timeMs = 0, overrides: OverrideMap = new Map()) {
  const existing = booleanOwner(scene, targetId)
  const sourceOwner = booleanOwner(scene, sourceId)
  if (existing && sourceOwner?.id === existing.id) return null
  if (sourceOwner) throw new Error('Choose a source outside another Boolean operation; Merge Paths first for nested results.')
  const targets = [targetId, sourceId].map(layerId => ({ layerId, label: scene.layers.find(layer => layer.id === layerId)?.name ?? layerId }))
  if (!existing) {
    const plan = prepareBooleanOperation(scene, targets, { operation, reverse: false, tolerancePx: .25 }, timeMs, overrides)
    return plan.command(backend.compute(plan.request))
  }
  const owner = editableBooleanOwner(scene, existing.id), recipe = owner.booleanOperation
  const source = scene.layers.find(layer => layer.id === sourceId)
  if (!source || source.parentId !== owner.parentId) throw new Error('Add Boolean inputs from the same parent as the operation group.')
  assertStaticBooleanInput(scene, source)
  assertLayerUnreferenced(scene, sourceId, 'This Boolean source has external readers. Keep it separate or remove those links first.')
  assertStaticTransform(scene, [owner.id])
  if (hasNativeExpressionOwner(scene, owner.id, 'transform')) throw new Error('Bake the operation transform before adding another input.')
  const siblings = scene.layers.filter(layer => layer.parentId === owner.parentId)
  if (Math.abs(siblings.indexOf(owner) - siblings.indexOf(source)) !== 1) throw new Error('Use adjacent sibling inputs to preserve unrelated stacking.')
  const transform = localTransform(layerTransformMatrix(owner.transform).invert().multiply(layerTransformMatrix(source.transform)), source.transform)
  const candidate = { ...scene, layers: scene.layers.map(layer => layer.id === owner.id
    ? { ...owner, booleanOperation: { ...recipe, inputs: [...recipe.inputs, { layerId: sourceId }] } }
    : layer.id === sourceId ? { ...source, parentId: owner.id, transform } : layer) }
  const plan = prepareBooleanOperation(candidate, [], { operation, reverse: recipe.reverse, tolerancePx: recipe.tolerancePx }, timeMs, overrides, owner.id)
  const next = plan.command(backend.compute(plan.request)).execute(candidate)
  return booleanSceneCommand(scene, next, 'Add Boolean input')
}

/** Re-edit a persisted operation through its existing plan/evaluator. One native
 * Undo restores its previous mode and sources; no source/point IDs are replaced. */
export function makeSetBooleanOperationCmd(scene: ChronoScene, ownerId: string, operation: BooleanOperation) {
  const owner = editableBooleanOwner(scene, ownerId), recipe = owner.booleanOperation
  const plan = prepareBooleanOperation(scene, [], { operation, reverse: recipe.reverse, tolerancePx: recipe.tolerancePx }, 0, new Map(), owner.id)
  return plan.command(backend.compute(plan.request))
}

import type { ChronoScene, Layer } from '../../types'
import type { OverrideMap } from '../../evaluator'
import type { BooleanOperationData } from '../../types/booleanOperation'
import type { BooleanOperation, BooleanResult } from '../../geometry/boolean'
import { Matrix2D } from '../../geometry/Matrix2D'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import { transformPathDefinition } from '../../geometry/transformPathDefinition'
import { polygonPathToSpline } from '../../geometry/boolean/polygonPathToSpline'
import { DEFAULT_TRANSFORM, newSplineLayerFromData } from '../../defaults'
import { newGroupLayer } from '../../registry/definitions/scene/GroupDefinition'
import { assertLayerUnreferenced } from '../../scene/references/assertLayerUnreferenced'
import { assertLayerAncestors } from '../../scene/hierarchy/assertLayerAncestors'
import { assertSceneBooleanOperations, assertStaticBooleanInput } from '../../booleanOperations/validation'
import { booleanOperationRequest, seedBooleanEvaluation } from '../../booleanOperations/evaluateOperation'
import type { EditorCommand } from '../commands-keyframe'
import type { BooleanTarget } from './prepareBooleanOperands'

export interface OperationSettings { operation: BooleanOperation; reverse: boolean; tolerancePx: number }

/** Resolve the recipe owner for a group, generated result or protected input.
 * This is a UI query only; absence never grants authoring authority. */
export function booleanOwner(scene: ChronoScene, id: string | null): Layer | undefined {
  return scene.layers.find(layer => layer.booleanOperation && (layer.id === id || layer.booleanOperation.resultLayerId === id || layer.booleanOperation.inputs.some(input => input.layerId === id)))
}

/** Prepare an immutable Boolean draft. Sources are direct, contiguous siblings
 * with equal lifetime and no independent drivers/readers; common parent motion
 * is retained. IDs/geometry/style/keys remain intact, only source parentId moves.
 * One group owns original inputs + an empty generated spline placeholder.
 * Tolerance is captured in a reproducible linear sampling space, independent of
 * future outer animation. Preview/Cancel never execute this plan's command.
 * Commit is compare-and-swap against the exact borrowed source; a late worker
 * reply cannot overwrite a human edit. Redo reuses the same IDs and recipe.
 */
export function prepareBooleanOperation(scene: ChronoScene, targets: readonly BooleanTarget[], settings: OperationSettings,
  timeMs: number, overrides: OverrideMap, editOwnerId?: string) {
  const existing = editOwnerId ? scene.layers.find(layer => layer.id === editOwnerId && layer.booleanOperation) : undefined
  if (editOwnerId && !existing) throw new Error('The Boolean operation no longer exists.')
  const inputs = (existing?.booleanOperation?.inputs ?? targets).map(({ layerId, subShapeId }) => ({ layerId, ...(subShapeId ? { subShapeId } : {}) }))
  const sources = Array.from(new Set(inputs.map(input => input.layerId))).map(id => {
    const layer = scene.layers.find(item => item.id === id)
    if (!layer) throw new Error('A Boolean source no longer exists.')
    assertStaticBooleanInput(scene, layer, existing ? 'retained' : 'new')
    assertLayerAncestors(scene, layer, { editable: true })
    return layer
  })
  const primary = sources[0]
  sources.sort((a, b) => scene.layers.indexOf(a) - scene.layers.indexOf(b))
  if (!sources.length) throw new Error('Select closed Boolean inputs.')
  let owner: Layer, output: Layer, candidate: ChronoScene
  if (existing) {
    owner = existing; output = scene.layers.find(layer => layer.id === owner.booleanOperation!.resultLayerId)!
  } else {
    const parentId = sources[0].parentId
    if (sources.some(layer => layer.parentId !== parentId)) throw new Error('Apply requires inputs under the same parent. Preview supports separate parents.')
    for (const source of sources) assertLayerUnreferenced(scene, source.id, 'A Boolean input has external readers. Keep it separate or explicitly remove those references first.')
    const ids = new Set(sources.map(layer => layer.id)), siblings = scene.layers.filter(layer => layer.parentId === parentId)
    const positions = siblings.flatMap((layer, index) => ids.has(layer.id) ? [index] : [])
    if (positions.at(-1)! - positions[0] + 1 !== positions.length) throw new Error('Apply requires contiguous sibling inputs to preserve unrelated layer stacking.')
    const taken = new Set(scene.layers.map(layer => layer.id))
    do { owner = newGroupLayer() } while (taken.has(owner.id))
    taken.add(owner.id)
    do { output = newSplineLayerFromData(polygonPathToSpline({ commands: [], closed: true }), { name: 'Boolean result', x: 0, y: 0 }) } while (taken.has(output.id))
    owner = { ...owner, name: `Boolean ${settings.operation}`, parentId, transform: { ...DEFAULT_TRANSFORM, x: 0, y: 0, anchorX: 0, anchorY: 0 }, startMs: sources[0].startMs, endMs: sources[0].endMs }
    output = { ...output, parentId: owner.id, booleanResultFor: owner.id, style: structuredClone(primary.style), opacity: primary.opacity,
      startMs: owner.startMs, endMs: owner.endMs, transform: { ...owner.transform } }
  }
  let world = Matrix2D.identity()
  if (existing) world = resolveLayerWorldMatrix(owner, scene, timeMs, overrides)
  else if (owner.parentId) {
    const parent = scene.layers.find(layer => layer.id === owner.parentId)
    if (!parent || parent.type !== 'group') throw new Error('Repair the Boolean input parent before Apply.')
    world = resolveLayerWorldMatrix(parent, scene, timeMs, overrides)
  }
  const recipe: BooleanOperationData = { version: 1, ...settings, inputs, resultLayerId: output.id,
    sampling: existing?.booleanOperation?.sampling ?? [world.a, world.b, world.c, world.d] }
  owner = { ...owner, booleanOperation: recipe }
  if (existing) candidate = { ...scene, layers: scene.layers.map(layer => layer.id === owner.id ? owner : layer) }
  else {
    const ids = new Set(sources.map(layer => layer.id)), position = Math.max(...scene.layers.map((layer, index) => ids.has(layer.id) ? index : -1))
    const layers = scene.layers.filter(layer => !ids.has(layer.id))
    const insertion = scene.layers.slice(0, position + 1).filter(layer => !ids.has(layer.id)).length
    layers.splice(insertion, 0, owner, ...sources.map(layer => ({ ...layer, parentId: owner.id })), output)
    candidate = { ...scene, layers }
  }
  assertSceneBooleanOperations(candidate)
  const request = booleanOperationRequest(candidate, recipe)
  const previewMatrix = world.multiply(new Matrix2D(...recipe.sampling, 0, 0).invert())
  return { ownerId: owner.id, request,
    preview: (result: BooleanResult): BooleanResult => ({ ...result, path: transformPathDefinition(result.path, previewMatrix) }),
    command(result: BooleanResult): EditorCommand {
      return { label: existing ? 'Edit Boolean operation' : 'Apply Boolean', execute(current) {
        if (current !== scene) throw new Error('The scene changed during Boolean preview. Preview again before Apply.')
        assertSceneBooleanOperations(candidate); seedBooleanEvaluation(candidate, recipe, result); return candidate
      }, undo: () => scene }
    } }
}

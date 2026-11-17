import { BOOLEAN_SCENE_LIMITS } from './limits'
import type { ChronoScene, Layer } from '../types'
import { removeSplineContours } from '../spline/topology'
import { assertBooleanOperation, assertSceneBooleanOperations } from './validation'
import { evaluateBooleanOperation } from './evaluateOperation'

let lastProjection: { source: WeakRef<ChronoScene>; result: WeakRef<ChronoScene> } | undefined
const projected = new WeakSet<ChronoScene>()
/** Propagate the runtime-only idempotence tag through override materialization.
 * Nothing is serialized; callers must not mutate a borrowed source snapshot. */
export function markBooleanProjection(scene: ChronoScene): void { projected.add(scene) }
/** Whether this exact immutable runtime snapshot has already been projected. */
export function isBooleanProjection(scene: ChronoScene): boolean { return projected.has(scene) }

/** Source-independent display projection. Generated child receives canonical
 * spline data; full sources are hidden only in this projection, partial sources
 * keep unconsumed Objects with original IDs/paint. Group hierarchy/source JSON
 * and animations remain unchanged. Invalid recipes fail open to their original
 * sources and hide the invalid generated result; strict output boundaries throw.
 * Only the last projection is weakly memoized; Undo history cannot retain a
 * second dense derived-geometry history through a projection cache. */
export function projectBooleanOperations(scene: ChronoScene): ChronoScene {
  if (projected.has(scene) || !scene.layers.some(layer => layer.booleanOperation)) return scene
  const known = lastProjection?.source.deref() === scene ? lastProjection.result.deref() : undefined
  if (known) return known
  const replacements = new Map<string, Layer>()
  let vertices = 0, operations = 0
  for (const owner of scene.layers) if (owner.booleanOperation) {
    const recipe = owner.booleanOperation, output = scene.layers.find(layer => layer.id === recipe.resultLayerId)
    try {
      assertBooleanOperation(scene, owner)
      if (++operations > BOOLEAN_SCENE_LIMITS.operations) throw new Error('Boolean scene operation budget exceeded.')
      const evaluation = evaluateBooleanOperation(scene, recipe)
      if (vertices + evaluation.result.outputVertices > BOOLEAN_SCENE_LIMITS.outputVertices) throw new Error('Boolean derived scene geometry budget exceeded.')
      vertices += evaluation.result.outputVertices
      replacements.set(output!.id, { ...output!, spline: evaluation.spline })
      for (const id of Array.from(new Set(recipe.inputs.map(input => input.layerId)))) {
        const source = scene.layers.find(layer => layer.id === id)!, refs = recipe.inputs.filter(input => input.layerId === id)
        if (refs.some(input => !input.subShapeId)) replacements.set(id, { ...source, hidden: true })
        else {
          const contours = new Set(refs.flatMap(input => source.spline!.subShapes[input.subShapeId!].contourIds))
          replacements.set(id, { ...source, spline: removeSplineContours(source.spline!, contours) })
        }
      }
    } catch { if (output) replacements.set(output.id, { ...output, hidden: true }) }
  }
  const result = { ...scene, layers: scene.layers.map(layer => replacements.get(layer.id) ?? layer) }
  projected.add(result); lastProjection = { source: new WeakRef(scene), result: new WeakRef(result) }; return result
}


/** Strict render-output admission: a solver/conversion failure must not export
 * fallback sources or a blank result. Viewport may fail open for recovery. */
export function assertBooleanOutput(scene: ChronoScene): void {
  assertSceneBooleanOperations(scene)
  let vertices = 0
  for (const layer of scene.layers) if (layer.booleanOperation) {
    vertices += evaluateBooleanOperation(scene, layer.booleanOperation).result.outputVertices
    if (vertices > BOOLEAN_SCENE_LIMITS.outputVertices) throw new Error('Boolean derived scene geometry budget exceeded: at most 65,536 output vertices.')
  }
}

/** Convert valid operation groups into ordinary runtime-compatible group/spline
 * source at export. Fully consumed sources are omitted; partial remainders and
 * output geometry stay ordinary splines. Live input drivers are refused by the
 * common policy, so outer animation is preserved without per-frame baking.
 * Portable project JSON must save the ORIGINAL scene, not this projection. */
export function flattenBooleanOperationsForOutput(scene: ChronoScene): ChronoScene {
  if (!scene.layers.some(layer => layer.booleanOperation)) return scene
  assertBooleanOutput(scene)
  const hidden = new Set(scene.layers.flatMap(layer => layer.booleanOperation?.inputs.filter(input => !input.subShapeId).map(input => input.layerId) ?? []))
  const result = projectBooleanOperations(scene)
  return { ...result, timelines: result.timelines.map(timeline => ({ ...timeline, layerIds: timeline.layerIds?.filter(id => !hidden.has(id)) })), layers: result.layers.filter(layer => !hidden.has(layer.id)).map(({ booleanOperation: _recipe, booleanResultFor: _owner, ...layer }) => layer) }
}

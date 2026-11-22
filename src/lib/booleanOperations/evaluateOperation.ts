import type { ChronoScene, Layer } from '../types'
import type { BooleanOperationData } from '../types/booleanOperation'
import type { BooleanRequest, BooleanResult } from '../geometry/boolean/types'
import { PolygonClippingBackend } from '../geometry/boolean/PolygonClippingBackend'
import { layerBooleanOperand } from '../geometry/boolean/layerOperand'
import { polygonPathToSpline } from '../geometry/boolean/polygonPathToSpline'
import { transformPathDefinition } from '../geometry/transformPathDefinition'
import { layerTransformMatrix } from '../geometry/layerTransformMatrix'
import { Matrix2D } from '../geometry/Matrix2D'

interface Evaluation { result: BooleanResult; spline: ReturnType<typeof polygonPathToSpline> }
interface Entry { sources: readonly WeakRef<Layer>[]; evaluation: Evaluation; bytes: number }
const cache = new Map<BooleanOperationData, Entry>()
const MAX_BYTES = 16 * 1024 ** 2, MAX_ENTRIES = 8
let cacheBytes = 0
/** Bounded derived-data accounting, not a browser heap/physical RAM reading. */
export function booleanGeometryCacheStatistics() { return { entries: cache.size, bytes: cacheBytes, maxBytes: MAX_BYTES, maxEntries: MAX_ENTRIES } }
/** Drop derived geometry without changing any source/history. */
export function clearBooleanGeometryCache(): void { cache.clear(); cacheBytes = 0 }

/** Build bounded static operands in the saved sampling space. Direct child
 * transforms are parent-local and therefore independent of outer group/ancestor
 * animation. No scene/frame objects or runtime handles enter the recipe. */
export function booleanOperationRequest(scene: ChronoScene, recipe: BooleanOperationData): BooleanRequest {
  const sampling = new Matrix2D(...recipe.sampling, 0, 0)
  return { operation: recipe.operation, reverse: recipe.reverse, tolerancePx: recipe.tolerancePx,
    operands: recipe.inputs.map(input => {
      const layer = scene.layers.find(item => item.id === input.layerId)
      if (!layer) throw new Error('A Boolean input no longer exists.')
      const operand = layerBooleanOperand(layer, input.subShapeId)
      return { ...operand, label: input.subShapeId ? layer.spline!.subShapes[input.subShapeId].name : layer.name,
        path: transformPathDefinition(operand.path, sampling.multiply(layerTransformMatrix(layer.transform))) }
    }) }
}

/** Convert privately owned solver output to the generated child-local spline.
 * Cache has at most eight entries / 16 MiB estimated geometry; source layers
 * are weak references, not retained source/asset owners. No frame history or
 * DOM/GPU buffers are cached. The conservative estimate is 1 KiB/output vertex. */
export function seedBooleanEvaluation(scene: ChronoScene, recipe: BooleanOperationData, result: BooleanResult): Evaluation {
  const path = transformPathDefinition(result.path, new Matrix2D(...recipe.sampling, 0, 0).invert())
  const evaluation = { result, spline: polygonPathToSpline(path) }
  const previous = cache.get(recipe)
  if (previous) { cacheBytes -= previous.bytes; cache.delete(recipe) }
  const bytes = Math.max(1024, result.outputVertices * 1024)
  while (cache.size && (cache.size >= MAX_ENTRIES || cacheBytes + bytes > MAX_BYTES)) {
    const oldest = cache.keys().next().value!; cacheBytes -= cache.get(oldest)!.bytes; cache.delete(oldest)
  }
  if (bytes <= MAX_BYTES) {
    cache.set(recipe, { sources: recipe.inputs.map(input => new WeakRef(scene.layers.find(layer => layer.id === input.layerId)!)), evaluation, bytes }); cacheBytes += bytes
  }
  return evaluation
}

/** Shared cold/static evaluation for renderer, bounds, picking and exports.
 * Steady playback hits the same cache even when outer transforms animate.
 * UI Apply pre-seeds with its worker result. Cold load or a static input edit
 * uses the same bounded solver once, never a separate render approximation. */
export function evaluateBooleanOperation(scene: ChronoScene, recipe: BooleanOperationData): Evaluation {
  const known = cache.get(recipe)
  if (known && recipe.inputs.every((input, i) => scene.layers.find(layer => layer.id === input.layerId) === known.sources[i].deref())) {
    cache.delete(recipe); cache.set(recipe, known); return known.evaluation
  }
  return seedBooleanEvaluation(scene, recipe, new PolygonClippingBackend().compute(booleanOperationRequest(scene, recipe)))
}

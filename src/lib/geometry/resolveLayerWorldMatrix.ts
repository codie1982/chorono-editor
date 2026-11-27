import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene, Layer } from '@/lib/types'
import { type OverrideMap } from '@/lib/evaluator'
import { createEvaluatedWorldMatrixResolver, resolveWorldMatrix } from './evaluatedWorldMatrix'
import { Matrix2D } from './Matrix2D'
import type { LayerLookup } from '@/lib/scene/LayerIndex'

/** Layer-local → composition coordinates, matching CanvasRenderer's scene walk.
 * Optional lookup is borrowed from this exact scene/frame; it changes lookup
 * cost only. Ordering, cyclic-parent truncation and override semantics remain.
 */
export function resolveLayerWorldMatrix(
  layer: Layer,
  scene: ChronoScene,
  timeMs = 0,
  overrides?: OverrideMap,
  lookup?: LayerLookup,
): Matrix2D {
  const frameOverrides = overrides ?? evaluateSceneFrame(scene, timeMs).overrides
  return resolveWorldMatrix(layer, scene, timeMs, frameOverrides, lookup)
}

/** Resolve many matrices from one borrowed frame, evaluating the scene only if omitted. */
export function createLayerWorldMatrixResolver(scene: ChronoScene, timeMs = 0,
  overrides?: OverrideMap, lookup?: LayerLookup): (layer: Layer) => Matrix2D {
  return createEvaluatedWorldMatrixResolver(scene, timeMs, overrides ?? evaluateSceneFrame(scene, timeMs).overrides, lookup)
}

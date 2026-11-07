import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { computeSplineBounds, type SplineBounds } from './computeSplineBounds'

/** Tight curve bounds for selection and viewport fitting, including parents. */
export function computeSplineWorldBounds(
  layer: Layer, scene: ChronoScene, timeMs = 0, overrides?: OverrideMap,
): SplineBounds | null {
  if (layer.type !== 'spline' || !layer.spline) return null
  const matrix = resolveLayerWorldMatrix(layer, scene, timeMs, overrides)
  return computeSplineBounds(layer.spline, matrix)
}

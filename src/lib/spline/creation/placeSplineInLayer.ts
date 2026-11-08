import type { ChronoScene, Layer } from '@/lib/types'
import type { SplinePathData } from '@/lib/types/spline'
import type { OverrideMap } from '@/lib/evaluator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { transformSplineData } from '../geometry/transformSplineData'

/** Put composition-space drawn geometry into an existing layer's local space. */
export function placeSplineInLayer(
  data: SplinePathData,
  centerX: number,
  centerY: number,
  target: Layer,
  scene: ChronoScene,
  timeMs = 0,
  overrides?: OverrideMap,
): SplinePathData | null {
  const matrix = resolveLayerWorldMatrix(target, scene, timeMs, overrides)
  if (Math.abs(matrix.determinant()) < 1e-9) return null
  return transformSplineData(data, matrix.invert().translate(centerX, centerY))
}

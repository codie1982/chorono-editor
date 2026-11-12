import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { transformBezierPath } from '@/lib/path/transformBezierPath'

/** Resolve a legacy Bezier path for composition-space picking/display and
 * local-space edits. Handles and anchors share the exact rendered affine
 * matrix. Singular matrices decline editing; path connectivity and metadata
 * are preserved. Returned records are transient and not scene/undo data. */
export function resolvePathEditGeometry(layer: Layer, scene: ChronoScene,
  timeMs: number, overrides?: OverrideMap) {
  if (!layer.path || layer.locked || layer.frozen || layer.hidden) return null
  const worldMatrix = resolveLayerWorldMatrix(layer, scene, timeMs, overrides)
  if (Math.abs(worldMatrix.determinant()) < 1e-9) return null
  const path = transformBezierPath(layer.path, worldMatrix)
  return { worldMatrix, worldToLocal: worldMatrix.invert(), worldPath: path }
}

import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'

/** Resolve a legacy Bezier path for composition-space picking/display and
 * local-space edits. Handles and anchors share the exact rendered affine
 * matrix. Singular matrices decline editing; path connectivity and metadata
 * are preserved. Returned records are transient and not scene/undo data. */
export function resolvePathEditGeometry(layer: Layer, scene: ChronoScene,
  timeMs: number, overrides?: OverrideMap) {
  if (!layer.path || layer.locked || layer.frozen || layer.hidden) return null
  const worldMatrix = resolveLayerWorldMatrix(layer, scene, timeMs, overrides)
  if (Math.abs(worldMatrix.determinant()) < 1e-9) return null
  const path = { ...layer.path, anchors: layer.path.anchors.map(anchor => ({
    ...anchor, ...worldMatrix.applyToPoint(anchor),
    ...(anchor.inX !== undefined && anchor.inY !== undefined ? (() => {
      const point = worldMatrix.applyToPoint({ x: anchor.inX, y: anchor.inY })
      return { inX: point.x, inY: point.y }
    })() : {}),
    ...(anchor.outX !== undefined && anchor.outY !== undefined ? (() => {
      const point = worldMatrix.applyToPoint({ x: anchor.outX, y: anchor.outY })
      return { outX: point.x, outY: point.y }
    })() : {}),
  })) }
  return { worldMatrix, worldToLocal: worldMatrix.invert(), worldPath: path }
}

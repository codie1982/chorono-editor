import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { transformSplineData } from '@/lib/spline/geometry/transformSplineData'
import { computeSplineWorldBounds } from '@/lib/spline/geometry/computeSplineWorldBounds'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'

/** Root spline translations are world translations; keep snapping on the visual box. */
export function resolveSplineMoveBounds(
  layer: Layer, scene: ChronoScene, timeMs: number, overrides?: OverrideMap,
) {
  if (layer.type !== 'spline' || layer.parentId) return null
  const bounds = computeSplineWorldBounds(layer, scene, timeMs, overrides)
  if (!bounds) return null
  const display = resolveDisplayTransform(layer, scene, timeMs, overrides ?? evaluateSceneFrame(scene, timeMs).overrides)
  return {
    width: bounds.width,
    height: bounds.height,
    boundsOffsetX: bounds.x - display.x,
    boundsOffsetY: bounds.y - display.y,
  }
}

/** Pick in world space so the handle radius stays constant under non-uniform scale. */
export function resolveSplineEditGeometry(
  layer: Layer,
  scene: ChronoScene,
  timeMs: number,
  overrides?: OverrideMap,
) {
  if (layer.type !== 'spline' || !layer.spline) return null
  const worldMatrix = resolveLayerWorldMatrix(layer, scene, timeMs, overrides)
  if (Math.abs(worldMatrix.determinant()) < 1e-9) return null
  return {
    worldMatrix,
    worldToLocal: worldMatrix.invert(),
    worldSpline: transformSplineData(layer.spline, worldMatrix),
  }
}

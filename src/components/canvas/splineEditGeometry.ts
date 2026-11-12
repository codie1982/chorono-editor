import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { transformSplineData } from '@/lib/spline/geometry/transformSplineData'
import { computeSplineWorldBounds } from '@/lib/spline/geometry/computeSplineWorldBounds'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'
import { materializeLayerOverrides } from '@/lib/render/materializeOverrides'
import { drivenChannelReason } from '@/lib/timeline/authoring/keyableChannels'
import { hasNativeExpressionOwner } from '@/lib/editor/inputExpressions/ExpressionAuthoringGuard'

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
    worldSpline: transformSplineData(materializeLayerOverrides(layer, overrides ?? evaluateSceneFrame(scene, timeMs).overrides).spline!, worldMatrix),
  }
}

/** Point moves can also change attached handle coordinates. Reject an edit
 * touching any live/bound channel rather than stamping a rendered pose back to
 * source. A whole-layer translation still uses the existing transform contract. */
export function drivenSplineEditReason(layer: Layer, scene: ChronoScene, family: 'points' | 'handles', id: string): string | null {
  const paths = ['spline.' + family + '.' + id]
  if (family === 'points') for (const handle of Object.values(layer.spline?.handles ?? {})) if (handle.pointId === id) paths.push('spline.handles.' + handle.id)
  if (paths.some(path => hasNativeExpressionOwner(scene, layer.id, path))) return 'Edit keyed spline coordinates on the timeline before changing source geometry.'
  return paths.map(path => drivenChannelReason(scene, layer, path)).find(Boolean) ?? null
}

/** Topology changes may remove/remap several stable points and handles. Keep
 * all coordinate drivers intact until an explicit native-key/source conversion. */
export function drivenSplineTopologyReason(layer: Layer, scene: ChronoScene): string | null {
  return hasNativeExpressionOwner(scene, layer.id, 'spline') ? 'Bake or remove keyed spline coordinates before editing topology.'
    : drivenChannelReason(scene, layer, 'spline')
}

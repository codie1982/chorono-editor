import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
// ── renderMotionBlurTrails ────────────────────────────────────────────────────
//
// Renders N low-opacity copies of a layer at past time positions to create a
// motion blur trail effect. Called from CanvasRenderer.renderLayer() BEFORE the
// main layer render so trails appear behind the current frame.
//
// This is intentionally separate from effectsChain — it requires temporal
// evaluation (calling evaluateTimelines at past times) which is only possible
// inside CanvasRenderer where scene, timeMs, and evaluator are all available.

import type { Layer, ChronoScene } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { evaluateTimelines, getLayerValue } from '@/lib/evaluator'
import type { ParamValueMap } from './RenderContext'
import type { AssetElementMap } from '@/lib/renderer'
import type { CanvasRenderer } from './CanvasRenderer'

export function renderMotionBlurTrails(
  renderer: CanvasRenderer,
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  overrides: OverrideMap,
  paramValues: ParamValueMap,
  assets: AssetElementMap,
  scene: ChronoScene,
  timeMs: number,
  renderingSet: Set<string>,
): void {
  const mb = layer.motionBlur
  if (!mb?.enabled || mb.baked) return

  const intervalMs = mb.frameInterval > 0
    ? mb.frameInterval
    : 1000 / scene.composition.frameRate

  // Compute velocity to decide whether to show trails
  const prevTimeMs     = Math.max(0, timeMs - intervalMs)
  const prevOverrides  = evaluateSceneFrame(scene, prevTimeMs, { paramValues }).overrides
  const curX  = getLayerValue(overrides,     layer.id, 'transform.x', layer.transform.x)
  const curY  = getLayerValue(overrides,     layer.id, 'transform.y', layer.transform.y)
  const prevX = getLayerValue(prevOverrides, layer.id, 'transform.x', layer.transform.x)
  const prevY = getLayerValue(prevOverrides, layer.id, 'transform.y', layer.transform.y)
  const speed = Math.sqrt((curX - prevX) ** 2 + (curY - prevY) ** 2)

  if (speed < mb.velocityThreshold) return

  const { trailCount, maxOpacity } = mb

  // Render farthest trail first so nearest renders on top
  for (let i = trailCount; i >= 1; i--) {
    const trailTimeMs    = Math.max(0, timeMs - i * intervalMs)
    const trailOverrides = evaluateSceneFrame(scene, trailTimeMs, { paramValues }).overrides
    // Linear fade: nearest trail = maxOpacity, farthest ≈ maxOpacity/trailCount
    const trailOpacity   = maxOpacity * (1 - (i - 1) / trailCount)

    ctx.save()
    ctx.globalAlpha *= Math.max(0, Math.min(1, trailOpacity))
    renderer.renderSingleLayer(ctx, layer, scene, assets, {
      overrides:   trailOverrides,
      paramValues,
      timeMs:      trailTimeMs,
    })
    ctx.restore()
  }
}

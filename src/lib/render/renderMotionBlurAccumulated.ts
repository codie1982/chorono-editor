import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
// ── renderMotionBlurAccumulated ───────────────────────────────────────────────────
//
// After Effects-style accumulation motion blur (GPU). Replaces the sharp layer
// with a smooth smear: many EQUAL-weight sub-frame samples across the shutter
// interval are averaged on the GPU, instead of overlaying a few opacity-decaying
// copies (the "ghost" look of renderMotionBlurTrails).
//
// Returns true when the GPU smear was drawn (caller skips the normal sharp
// render). Returns false when motion blur shouldn't apply (not moving) or the
// GPU is unavailable — the caller then falls back to renderMotionBlurTrails.
//
// Shutter length is kept identical to the trail renderer (trailCount ×
// frameInterval) so the blur EXTENT matches what users already tuned; only the
// quality changes (smooth vs discrete). Sample count is raised for smoothness.

import type { Layer, ChronoScene } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { getLayerValue } from '@/lib/evaluator'
import type { ParamValueMap } from './RenderContext'
import type { AssetElementMap } from '@/lib/renderer'
import type { CanvasRenderer } from './CanvasRenderer'
import { renderSurfacePool, type CanvasSurfaceLease } from './resources/CanvasSurfacePool'
import { gpuMotionBlur } from './gpu/effects/GPUMotionBlur'

/** Render equal-weight sub-frame samples using one leased sample surface. The
 * sample and streaming GPU pin survive nested layer draws, then release on every
 * return/exception. Time remains composition milliseconds; source scene/override
 * maps are borrowed. Admission failures propagate without changing quality. */
export function renderMotionBlurAccumulated(
  renderer:     CanvasRenderer,
  ctx:          CanvasRenderingContext2D,
  layer:        Layer,
  overrides:    OverrideMap,
  paramValues:  ParamValueMap,
  assets:       AssetElementMap,
  scene:        ChronoScene,
  timeMs:       number,
  _renderingSet: Set<string>,
): boolean {
  const mb = layer.motionBlur
  if (!mb?.enabled || mb.baked) return false

  const intervalMs = mb.frameInterval > 0
    ? mb.frameInterval
    : 1000 / scene.composition.frameRate

  // ── Velocity gate (same as the trail renderer) ──────────────────────────
  const prevTimeMs    = Math.max(0, timeMs - intervalMs)
  const prevOverrides = evaluateSceneFrame(scene, prevTimeMs, { paramValues }).overrides
  const curX  = getLayerValue(overrides,     layer.id, 'transform.x', layer.transform.x)
  const curY  = getLayerValue(overrides,     layer.id, 'transform.y', layer.transform.y)
  const prevX = getLayerValue(prevOverrides, layer.id, 'transform.x', layer.transform.x)
  const prevY = getLayerValue(prevOverrides, layer.id, 'transform.y', layer.transform.y)
  const speed = Math.sqrt((curX - prevX) ** 2 + (curY - prevY) ** 2)
  if (speed < mb.velocityThreshold) return false

  const compW = scene.composition.width
  const compH = scene.composition.height
  if (compW === 0 || compH === 0) return false

  // ── Sampling plan ───────────────────────────────────────────────────────
  // Shutter span matches the trail renderer; sample count is raised so the
  // average reads as a continuous smear rather than discrete echoes.
  const shutterMs   = Math.max(1, mb.trailCount) * intervalMs
  const sampleCount = Math.min(32, Math.max(12, mb.trailCount * 4))

  if (!gpuMotionBlur.begin(compW, compH, sampleCount)) return false   // GPU unavailable
  let sample: CanvasSurfaceLease | undefined
  try {
    // Render samples with NORMAL compositing so blend-mode layers sample cleanly
    // onto the empty buffer; the real blend mode is applied at final composite.
    const sampleLayer: Layer = { ...layer, blendMode: 'source-over' as Layer['blendMode'] }
    sample = renderSurfacePool.acquire(compW, compH)
    const canvas = sample.canvas
    const sctx = sample.context

    for (let k = 0; k < sampleCount; k++) {
      const t = sampleCount > 1 ? k / (sampleCount - 1) : 0
      const sampleTimeMs    = Math.max(0, timeMs - shutterMs * t)
      const sampleOverrides = evaluateSceneFrame(scene, sampleTimeMs, { paramValues }).overrides

      sctx.setTransform(1, 0, 0, 1, 0, 0)
      sctx.clearRect(0, 0, compW, compH)
      renderer.renderSingleLayer(sctx, sampleLayer, scene, assets, {
        overrides:   sampleOverrides,
        paramValues,
        timeMs:      sampleTimeMs,
      })
      gpuMotionBlur.addSample(canvas)
    }

    const result = gpuMotionBlur.finish()
    if (!result) return false

    // ── Composite the averaged smear (identity transform; keep parent alpha,
    //    apply this layer's blend mode) ──────────────────────────────────────
    ctx.save()
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) ?? 'source-over'
      ctx.drawImage(result, 0, 0, compW, compH)
    } finally { ctx.restore() }

    return true
  } finally {
    sample?.release()
    gpuMotionBlur.cancel()
  }
}

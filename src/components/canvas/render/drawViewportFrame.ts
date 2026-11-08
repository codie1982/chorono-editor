import type { CanvasRendererOptions } from './CanvasRendererOptions'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import { getMultiLayerGhostFrames } from '@/lib/animation/ghostFrames'
import type { OverrideMap } from '@/lib/evaluator'
import { paintWorkMonitor } from '@/lib/resources/performance/PaintWorkMonitor'
import { visibleCanvasArea } from '@/lib/render/visibility/visibleCanvasArea'
import { renderWorkMonitor } from '@/lib/resources/performance/RenderWorkMonitor'

/**
 * Draw one committed editor viewport snapshot synchronously. The caller owns
 * the canvas and schedules/cancels work; this adapter borrows scene/maps/media
 * for the duration of the call, preserving render/ghost order and composition
 * millisecond timing. Browser layout is read at execution, after pan/zoom CSS
 * has committed. Resource counters measure actual drawing, never queue latency.
 * Canvas2D absence is a no-op; renderer failures propagate after accounting.
 * No timer, persistent scene cache, GPU buffer or canvas ownership is acquired.
 */
export function drawViewportFrame(canvas: HTMLCanvasElement, opts: CanvasRendererOptions): void {
  const {
    scene, timeMs, selectedLayerId, selectedLayerIds, assets, viewportRef, viewportScale,
    snapEnabled, snapToGridOn, gridSize, overrides, paramValues, dragOverrides,
    ghostSettings, selectedTimeline, hideEditorUI,
  } = opts
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const workStarted = performance.now()
  try {
  // Merge timeline/runtime overrides with the temporary drag override so
  // the dragged layer visibly follows the cursor.
  let mergedOverrides = overrides
  if (dragOverrides.size > 0) {
    const m: OverrideMap = new Map()
    overrides?.forEach((v, k) => m.set(k, v))
    dragOverrides.forEach((v, k) => m.set(k, v))
    mergedOverrides = m
  }
  const viewport = viewportRef?.current
  const canvasRect = canvas.getBoundingClientRect()
  const animating = viewport?.getAnimations?.({ subtree: true }).some(animation => animation.playState === 'running')
  const visibleArea = viewport && !animating
    ? visibleCanvasArea(canvasRect, viewport.getBoundingClientRect(), canvas.width, canvas.height) : undefined
  try {
  canvasRenderer.render(
    ctx, scene, timeMs, selectedLayerId, assets,
    {
      // Grid drawn only when both the master snap is on AND the "Snap to
      // grid" type is enabled — matches the visual / behaviour contract
      // ("grid açıksa snap olur, kapalıysa olmaz").
      grid:        (snapEnabled && snapToGridOn) ? { size: gridSize } : undefined,
      overrides:   mergedOverrides,
      paramValues,
      visibleArea,
      mediaPadding: canvasRect.width > 0 ? 128 * canvas.width / canvasRect.width : 0,
      mediaPrefetchMs: 500,
      lod: viewportScale !== undefined && !ghostSettings?.enabled ? { zoom: viewportScale } : undefined,
      selectedLayerIds,
      // SceneCanvas draws the single editable DOM frame for every selection.
      selectionOutline: false,
      // BL-66 — playback / preview → 'preview' (clean frame); else 'editor'.
      renderMode:  hideEditorUI ? 'preview' : 'editor',
    },
  )

  } finally {
    // Capture before renderSingleLayer changes legacy visit counters. Renderer
    // failure remains explicitly partial rather than a successful zero frame.
    paintWorkMonitor.record(scene, canvasRenderer.getLastPaintStatistics())
  }

  // ── BL-56 — Ghost / Onion-Skin overlay ───────────────────────────────
  // Render interpolated layer states at ±N frames around the playhead at
  // reduced opacity. Drawn ON TOP of the live scene so the main frame
  // remains the visual anchor; ghosts act as motion-path context.
  if (ghostSettings?.enabled && selectedTimeline) {
    const ghostFrames = getMultiLayerGhostFrames(
      scene.layers,
      selectedTimeline,
      timeMs,
      ghostSettings.beforeFrames,
      ghostSettings.afterFrames,
      ghostSettings.scope,
      ghostSettings.scope === 'selected' ? selectedLayerIds : undefined,
      ghostSettings.fps ?? 30,
    )

    const opacityFactor = ghostSettings.opacity / 100
    for (const gf of ghostFrames) {
      const layer = scene.layers.find((l) => l.id === gf.layerId)
      if (!layer) continue

      // Build an override map that pins this layer's transform/opacity to
      // the interpolated ghost values. Other layers inherit base overrides.
      const ghostOverrides: OverrideMap = new Map()
      mergedOverrides?.forEach((v, k) => ghostOverrides.set(k, v))
      if (gf.transform) {
        ghostOverrides.set(`layers.${layer.id}.transform.x`,           gf.transform.x)
        ghostOverrides.set(`layers.${layer.id}.transform.y`,           gf.transform.y)
        ghostOverrides.set(`layers.${layer.id}.transform.scaleX`,      gf.transform.scaleX)
        ghostOverrides.set(`layers.${layer.id}.transform.scaleY`,      gf.transform.scaleY)
        ghostOverrides.set(`layers.${layer.id}.transform.rotationDeg`, gf.transform.rotationDeg)
      }
      if (gf.opacity !== undefined) {
        ghostOverrides.set(`layers.${layer.id}.opacity`, gf.opacity)
      }

      ctx.save()
      ctx.globalAlpha = opacityFactor
      canvasRenderer.renderSingleLayer(ctx, layer, scene, assets, {
        overrides:   ghostOverrides,
        paramValues,
        timeMs:      gf.timeMs,
      })
      ctx.restore()
    }
  }
  } finally {
    renderWorkMonitor.record('viewport', performance.now() - workStarted)
  }
}

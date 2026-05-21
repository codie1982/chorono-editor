import { useEffect, type RefObject } from 'react'
import type { ChronoScene, Timeline } from '@/lib/types'
import type { TimelineGhostSettings } from '@/lib/types/editor'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import type { AssetElementMap } from '@/lib/renderer'
import { getMultiLayerGhostFrames } from '@/lib/animation/ghostFrames'

export interface CanvasRendererOptions {
  scene: ChronoScene
  timeMs: number
  selectedLayerId: string | null
  selectedLayerIds?: Set<string>
  assets: AssetElementMap
  /** Master snap enabled (controls whether the grid is drawn). */
  snapEnabled: boolean
  snapToGridOn: boolean
  gridSize: number
  /** Timeline / runtime override map (already merged upstream). */
  overrides?: Map<string, number>
  paramValues?: Map<string, string | number | boolean>
  /** Live drag override so the dragged layer follows the cursor even when keyframed. */
  dragOverrides: Map<string, number>
  ghostSettings?: TimelineGhostSettings
  selectedTimeline?: Timeline | null
}

/**
 * Draws the scene (plus the ghost / onion-skin overlay) onto the canvas
 * whenever any visual input changes. Pure render concern — no interaction or
 * scene-mutation logic lives here.
 */
export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement>,
  opts: CanvasRendererOptions,
): void {
  const {
    scene, timeMs, selectedLayerId, selectedLayerIds, assets,
    snapEnabled, snapToGridOn, gridSize,
    overrides, paramValues, dragOverrides,
    ghostSettings, selectedTimeline,
  } = opts

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Merge timeline/runtime overrides with the temporary drag override so
    // the dragged layer visibly follows the cursor.
    let mergedOverrides = overrides
    if (dragOverrides.size > 0) {
      const m = new Map<string, number>()
      overrides?.forEach((v, k) => m.set(k, v))
      dragOverrides.forEach((v, k) => m.set(k, v))
      mergedOverrides = m
    }
    canvasRenderer.render(
      ctx, scene, timeMs, selectedLayerId, assets,
      {
        // Grid drawn only when both the master snap is on AND the "Snap to
        // grid" type is enabled — matches the visual / behaviour contract
        // ("grid açıksa snap olur, kapalıysa olmaz").
        grid:        (snapEnabled && snapToGridOn) ? { size: gridSize } : undefined,
        overrides:   mergedOverrides,
        paramValues,
        selectedLayerIds,
      },
    )

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
        const ghostOverrides = new Map<string, number>()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, timeMs, selectedLayerId, selectedLayerIds, assets, snapEnabled, snapToGridOn, gridSize, overrides, paramValues, dragOverrides, ghostSettings, selectedTimeline])
}

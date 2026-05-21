// ── CanvasRenderer2D ──────────────────────────────────────────────────────────
// Implements IRenderer for the '2danimation' mode.
// All rendering logic stays in renderer.ts — this class is a thin adapter that
// connects the abstract IRenderer interface to the existing Canvas 2D pipeline.

import type { IRenderer, RenderContext } from '../core/IRenderer'
import type { ISceneObject } from '../core/ISceneObject'
import type { ITimeline } from '../core/ITimeline'
import type { Layer, ChronoScene } from '../types'
import { renderScene, type AssetElementMap, type RenderOptions } from '../renderer'

export class CanvasRenderer2D implements IRenderer {
  readonly mode = '2danimation' as const

  /** Asset element map (image/video DOM nodes). Kept here so callers can
   *  update it without reconstructing the renderer. */
  assets: AssetElementMap = new Map()

  /** Extra render options forwarded to renderScene (overrides, paramValues, grid). */
  options: RenderOptions = {}

  /** Selected layer id highlighted with a selection frame (null = none). */
  selectedLayerId: string | null = null

  /**
   * Render the full scene at `ctx.timeMs`.
   *
   * `objects` and `timeline` satisfy the generic IRenderer contract.
   * Internally we cast to ChronoScene types — this is safe because
   * CanvasRenderer2D only ever receives 2D animation objects.
   */
  render(
    objects: ISceneObject[],
    timeline: ITimeline,
    { canvas, timeMs }: RenderContext,
  ): void {
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return

    // Build a minimal ChronoScene shell so renderScene() can operate.
    // Only `layers`, `timelines`, and `composition` are used by renderScene.
    const scene = this._buildShellScene(objects, timeline)

    renderScene(
      ctx2d,
      scene,
      timeMs,
      this.selectedLayerId,
      this.assets,
      this.options,
    )
  }

  clear(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  /**
   * Produce a minimal ChronoScene that renderScene() accepts.
   * The full scene is owned by the editor state; we only proxy what's needed.
   * If the caller already has a full ChronoScene it can use renderScene()
   * directly — this adapter is for when the caller only has ISceneObject[].
   */
  private _buildShellScene(
    objects: ISceneObject[],
    timeline: ITimeline,
  ): ChronoScene {
    return {
      formatVersion: '1.0.0',
      mode: '2danimation',
      composition: {
        id: 'shell',
        width: 0,    // caller must update canvas size separately
        height: 0,
        durationMs: timeline.durationMs,
        frameRate: 60,
        backgroundColor: '#FFFFFF',
      },
      assets: [],
      layers: objects as unknown as Layer[],
      timelines: [],   // overrides supplied via options.overrides
      parameters: [],
      triggers: [],
      bindings: [],
      initialState: {},
    }
  }
}

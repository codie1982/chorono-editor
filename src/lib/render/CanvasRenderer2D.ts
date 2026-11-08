// ── CanvasRenderer2D ──────────────────────────────────────────────────────────
// Implements IRenderer for the '2danimation' mode.
// The editor, SDK mode adapter and raster exports share the registry pipeline.

import type { IRenderer, RenderContext } from '../core/IRenderer'
import type { ISceneObject } from '../core/ISceneObject'
import type { ITimeline } from '../core/ITimeline'
import type { Layer, ChronoScene } from '../types'
import type { AssetElementMap } from '../renderer'
import { CanvasRenderer, type CanvasRenderOptions } from './CanvasRenderer'
import type { OverrideMap } from '../evaluator'

export class CanvasRenderer2D implements IRenderer {
  readonly mode = '2danimation' as const
  private readonly renderer = new CanvasRenderer()

  /** Asset element map (image/video DOM nodes). Kept here so callers can
   *  update it without reconstructing the renderer. */
  assets: AssetElementMap = new Map()

  /** Explicit overrides take precedence over the supplied timeline evaluator. */
  options: CanvasRenderOptions = {}

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

    const scene = this._buildShellScene(objects, timeline, canvas.width, canvas.height)
    const overrides: OverrideMap = this.options.overrides
      ?? new Map(timeline.evaluate(timeMs).map(value => [value.path, value.value]))

    this.renderer.render(
      ctx2d,
      scene,
      timeMs,
      this.selectedLayerId,
      this.assets,
      { ...this.options, overrides },
    )
  }

  clear(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  /**
   * Produce a minimal scene with the actual backing dimensions.
   * The full scene is owned by the editor state; we only proxy what's needed.
   * If the caller already has a full ChronoScene it can use CanvasRenderer
   * directly — this adapter is for when the caller only has ISceneObject[].
   */
  private _buildShellScene(
    objects: ISceneObject[],
    timeline: ITimeline,
    width: number,
    height: number,
  ): ChronoScene {
    return {
      formatVersion: '1.0.0',
      mode: '2danimation',
      composition: {
        id: 'shell',
        width,
        height,
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

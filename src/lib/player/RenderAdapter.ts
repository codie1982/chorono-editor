// ── RenderAdapter ─────────────────────────────────────────────────────────────
//
// Abstract render surface for ChronoPlayer. Keeps the player core renderer-
// agnostic: the web adapter draws with the editor's CanvasRenderer (zero
// duplication, pixel-identical to the editor via renderMode='preview'), while
// native backends (Skia / Metal) can implement the same interface later.
//
// OOP per coding_standards_oop: abstract base first, concrete adapters extend.

import type { ChronoScene } from '@/lib/types'
import type { AssetElementMap } from '@/lib/renderer'
import type { OverrideMap } from '@/lib/evaluator'
import type { ParamValueMap } from '@/lib/runtime/paramResolver'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import { VisualMediaSession } from '@/lib/render/media/VisualMediaSession'
import { syncVideoFrame } from '@/lib/render/media/syncVideoFrame'

export interface RenderFrame {
  scene: ChronoScene
  timeMs: number
  overrides: OverrideMap
  paramValues: ParamValueMap
  assets: AssetElementMap
}

export abstract class RenderAdapter {
  /** Draw one fully-evaluated frame. */
  abstract render(frame: RenderFrame): void
  /** Release resources owned by this adapter. Default backends own no resources. */
  dispose?(): void {}
}

/**
 * Web preview adapter with independent media consumer ownership. Readiness
 * redraws the latest evaluated snapshot without ticking the runtime again.
 * Explicit legacy ready Maps remain externally owned. dispose cancels pending
 * redraw and releases this adapter's pins; it never disposes the shared service.
 */
export class CanvasRenderAdapter extends RenderAdapter {
  private _ctx: CanvasRenderingContext2D
  private readonly media = new VisualMediaSession()
  private current: RenderFrame | null = null
  private redraw: number | null = null

  /** Borrow the canvas context and start a resource-only invalidation listener. */
  constructor(ctx: CanvasRenderingContext2D) {
    super()
    this._ctx = ctx
    this.media.start(() => {
      if (this.redraw !== null || !this.current) return
      this.redraw = requestAnimationFrame(() => { this.redraw = null; if (this.current) this.render(this.current) })
    })
  }

  get ctx(): CanvasRenderingContext2D {
    return this._ctx
  }

  /** Draw the latest borrowed frame, preparing this player's own scoped clips. */
  render(frame: RenderFrame): void {
    this.current = frame
    // A managed editor view is never this player's media lifetime/clip scope.
    // Explicit legacy ready maps remain borrowed from their external owner.
    const assets = !frame.assets.media && frame.assets.size ? frame.assets : this.media.elements()
    syncVideoFrame(frame.scene, assets, frame.timeMs, { playing: false, speed: 1, overrides: frame.overrides })
    canvasRenderer.render(
      this._ctx,
      frame.scene,
      frame.timeMs,
      null,
      assets,
      {
        overrides: frame.overrides,
        paramValues: frame.paramValues,
        renderMode: 'preview',
      },
    )
  }
  /** Cancel redraw and release only this player's independent media consumer. */
  dispose(): void {
    if (this.redraw !== null) cancelAnimationFrame(this.redraw)
    this.redraw = null; this.current = null; this.media.stop()
  }
}

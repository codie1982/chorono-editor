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
}

/**
 * Web adapter — renders to a 2D canvas using the shared CanvasRenderer in
 * preview mode (no editor chrome). Identical output to the editor viewport.
 */
export class CanvasRenderAdapter extends RenderAdapter {
  private _ctx: CanvasRenderingContext2D

  constructor(ctx: CanvasRenderingContext2D) {
    super()
    this._ctx = ctx
  }

  get ctx(): CanvasRenderingContext2D {
    return this._ctx
  }

  render(frame: RenderFrame): void {
    canvasRenderer.render(
      this._ctx,
      frame.scene,
      frame.timeMs,
      null,
      frame.assets,
      {
        overrides: frame.overrides,
        paramValues: frame.paramValues,
        renderMode: 'preview',
      },
    )
  }
}

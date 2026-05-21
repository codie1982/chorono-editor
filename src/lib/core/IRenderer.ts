// ── IRenderer ─────────────────────────────────────────────────────────────────
// Abstract renderer contract. CanvasRenderer2D (current renderer.ts) implements
// this for the 2D animation mode. Future modes plug in WebGL or Three.js
// renderers without touching existing 2D rendering code.

import type { EditorMode } from './EditorMode'
import type { ISceneObject } from './ISceneObject'
import type { ITimeline } from './ITimeline'

export interface RenderContext {
  canvas: HTMLCanvasElement
  /** Current playhead position in milliseconds. */
  timeMs: number
  /** Device pixel ratio for HiDPI rendering. */
  dpr?: number
}

export interface IRenderer {
  /** Mode this renderer serves. Used for dispatch in multi-mode scenes. */
  mode: EditorMode

  /**
   * Render all objects at the given time onto the canvas.
   * The renderer is responsible for applying timeline values to objects.
   */
  render(
    objects: ISceneObject[],
    timeline: ITimeline,
    ctx: RenderContext,
  ): void

  /** Optional: clear the canvas before rendering. */
  clear?(canvas: HTMLCanvasElement): void
}

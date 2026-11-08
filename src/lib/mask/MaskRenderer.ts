// ── MaskRenderer ──────────────────────────────────────────────────────────────
//
// Applies a list of MaskDefinitions to a host layer's content. Algorithm:
//
//   1. Render the host content to offscreen canvas A
//   2. For each mask:
//        a. Render the mask layer's silhouette to offscreen canvas B
//        b. Optionally apply feather blur to B
//        c. Composite A and B based on mode (add/subtract/intersect)
//   3. Draw the final composite back to the main canvas
//
// Sprint 6 ships V1 with:
//   - 'add' mode (uses 'destination-in' composite)
//   - 'subtract' mode (uses 'destination-out')
//   - 'intersect' mode (sequential destination-in)
//   - Basic feather via ctx.filter = 'blur(Npx)'
//
// V1.5 / V2: alpha masks, luma masks, group masks, multi-mask layering with
// pixel-level intersection.

import type { Layer, MaskDefinition } from '@/lib/types'
import { renderSurfacePool, type CanvasSurfaceProvider } from '@/lib/render/resources/CanvasSurfacePool'

export interface MaskRenderArgs {
  /** Canvas to draw the final masked result onto. */
  destCtx:       CanvasRenderingContext2D
  /** Width × height of the destination area (composition pixels). */
  width:         number
  height:        number
  /** Integer composition origin of a cropped surface; default (0,0). Host
   * content is already surface-local. Mask callbacks draw in composition space
   * and must preserve their incoming transform. Inversion fills only this
   * local domain; the planner must preserve all host/filter neighbourhoods. */
  origin?:      { x: number; y: number }
  /** When supplied, rasterize the silhouette/feather/inversion in the original
   * full composition, then copy the integer ROI. Preserves native path AA and
   * CSS filter extent semantics; content/output leases remain region-sized. */
  compositionSize?: { width: number; height: number }
  /** Host layer being masked. */
  hostLayer:     Layer
  /** Renders the host layer's content to a given offscreen canvas. */
  renderHost:    (offCtx: CanvasRenderingContext2D) => void
  /** Renders a specific mask layer's silhouette to a given offscreen canvas. */
  renderMask:    (maskLayer: Layer, offCtx: CanvasRenderingContext2D) => void
  /** Resolve a mask layer by id. */
  getLayer:      (id: string) => Layer | undefined
}

/**
 * Composites masks with temporary, exclusively borrowed Canvas2D surfaces.
 * The pool owns backing-store residency; this renderer retains no scene pixels
 * or versioned mask results. A mask list uses one content and one sequential
 * silhouette lease, independent of its length. Nested renders borrow distinct
 * surfaces. All leases return on success and on callback/compositing failures.
 */
export class MaskRenderer {
  /** Shares the application's scratch budget unless a caller injects an isolated pool. */
  constructor(private readonly surfaces: CanvasSurfaceProvider = renderSurfacePool) {}

  /**
   * Draws the host and masks in the caller's composition-pixel coordinate space.
   * Existing feather/inversion/mode/opacity semantics are preserved. No masks
   * draw directly to destCtx; otherwise admission/drawing errors propagate after
   * cleanup so callers never receive an unmasked frame as a successful result.
   */
  render(masks: MaskDefinition[], args: MaskRenderArgs): void {
    if (masks.length === 0) {
      args.renderHost(args.destCtx)
      return
    }

    const content = this.surfaces.acquire(args.width, args.height)
    try {
      const contentCtx = content.context
      args.renderHost(contentCtx)

      for (const mask of masks) {
        const maskLayer = args.getLayer(mask.maskLayerId)
        if (!maskLayer) continue

        const full = args.compositionSize
        const silhouette = this.surfaces.acquire(full?.width ?? args.width, full?.height ?? args.height)
        try {
          const maskCtx = silhouette.context
          if (mask.feather && mask.feather > 0) {
            maskCtx.filter = `blur(${mask.feather}px)`
          }
          const { x, y } = args.origin ?? { x: 0, y: 0 }
          if (!full && (x || y)) maskCtx.translate(-x, -y)
          args.renderMask(maskLayer, maskCtx)
          if (!full && (x || y)) maskCtx.translate(x, y)
          maskCtx.filter = 'none'

          if (mask.inverted) {
            maskCtx.save()
            maskCtx.globalCompositeOperation = 'difference'
            maskCtx.fillStyle = '#FFFFFF'
            maskCtx.fillRect(0, 0, silhouette.canvas.width, silhouette.canvas.height)
            maskCtx.restore()
          }

          contentCtx.save()
          contentCtx.globalAlpha = mask.opacity ?? 1
          contentCtx.globalCompositeOperation =
              mask.mode === 'subtract' ? 'destination-out'
            : 'destination-in'
          if (full) contentCtx.drawImage(silhouette.canvas,x,y,args.width,args.height,0,0,args.width,args.height)
          else contentCtx.drawImage(silhouette.canvas, 0, 0)
          contentCtx.restore()
        } finally {
          silhouette.release()
        }
      }

      args.destCtx.drawImage(content.canvas, 0, 0)
    } finally {
      content.release()
    }
  }
}

export const defaultMaskRenderer = new MaskRenderer()

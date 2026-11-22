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
 * or versioned mask results. A single mask uses two leases. Multiple masks
 * add one accumulated matte lease, independent of their count.
 * Nested renders borrow distinct surfaces. All leases return on failure.
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

      const withSilhouette = (
        mask: MaskDefinition,
        paint: (canvas: HTMLCanvasElement, x: number, y: number, full: boolean) => void,
      ): boolean => {
        const maskLayer = args.getLayer(mask.maskLayerId)
        if (!maskLayer) return false

        const full = args.compositionSize
        const silhouette = this.surfaces.acquire(full?.width ?? args.width, full?.height ?? args.height)
        try {
          const maskCtx = silhouette.context
          const { x, y } = args.origin ?? { x: 0, y: 0 }
          maskCtx.save()
          try {
            if (mask.feather && mask.feather > 0) maskCtx.filter = `blur(${mask.feather}px)`
            if (!full && (x || y)) maskCtx.translate(-x, -y)
            args.renderMask(maskLayer, maskCtx)
          } finally {
            // A mask renderer may leave an active clip or transform. Restore it
            // before filling the inverse alpha across the entire domain.
            maskCtx.restore()
          }

          if (mask.inverted) {
            maskCtx.save()
            // XOR with opaque white computes inverse *alpha*. Difference only
            // changes RGB and makes a transparent silhouette fully opaque.
            maskCtx.globalCompositeOperation = 'xor'
            maskCtx.fillStyle = '#FFFFFF'
            maskCtx.fillRect(0, 0, silhouette.canvas.width, silhouette.canvas.height)
            maskCtx.restore()
          }

          paint(silhouette.canvas, x, y, !!full)
        } finally {
          silhouette.release()
        }
        return true
      }

      const composite = (target: CanvasRenderingContext2D, mask: MaskDefinition,
        operation: GlobalCompositeOperation, canvas: HTMLCanvasElement, x: number, y: number, full: boolean) => {
        target.save()
        target.globalAlpha = Math.max(0, Math.min(1, mask.opacity ?? 1))
        target.globalCompositeOperation = operation
        if (full) target.drawImage(canvas, x, y, args.width, args.height, 0, 0, args.width, args.height)
        else target.drawImage(canvas, 0, 0)
        target.restore()
      }

      if (masks.length === 1) {
        const mask = masks[0]
        withSilhouette(mask, (canvas, x, y, full) => composite(contentCtx, mask,
          mask.mode === 'subtract' ? 'destination-out' : 'destination-in', canvas, x, y, full))
      } else {
        const matte = this.surfaces.acquire(args.width, args.height)
        try {
          const matteCtx = matte.context
          let hasMatte = false
          for (const mask of masks) {
            const applied = withSilhouette(mask, (canvas, x, y, full) => {
              if (!hasMatte && mask.mode === 'subtract') {
                matteCtx.fillStyle = '#FFFFFF'
                matteCtx.fillRect(0, 0, args.width, args.height)
              }
              composite(matteCtx, mask, mask.mode === 'subtract' ? 'destination-out'
                : mask.mode === 'intersect' && hasMatte ? 'destination-in' : 'source-over',
              canvas, x, y, full)
            })
            hasMatte ||= applied
          }
          if (hasMatte) {
            contentCtx.globalCompositeOperation = 'destination-in'
            contentCtx.drawImage(matte.canvas, 0, 0)
          }
        } finally {
          matte.release()
        }
      }

      args.destCtx.drawImage(content.canvas, 0, 0)
    } finally {
      content.release()
    }
  }
}

export const defaultMaskRenderer = new MaskRenderer()

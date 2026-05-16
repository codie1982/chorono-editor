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
import { OffscreenCanvasCache, createOffscreen } from '@/lib/render/OffscreenCanvasCache'

export interface MaskRenderArgs {
  /** Canvas to draw the final masked result onto. */
  destCtx:       CanvasRenderingContext2D
  /** Width × height of the destination area (composition pixels). */
  width:         number
  height:        number
  /** Host layer being masked. */
  hostLayer:     Layer
  /** Renders the host layer's content to a given offscreen canvas. */
  renderHost:    (offCtx: CanvasRenderingContext2D) => void
  /** Renders a specific mask layer's silhouette to a given offscreen canvas. */
  renderMask:    (maskLayer: Layer, offCtx: CanvasRenderingContext2D) => void
  /** Resolve a mask layer by id. */
  getLayer:      (id: string) => Layer | undefined
}

export class MaskRenderer {
  constructor(private cache: OffscreenCanvasCache = new OffscreenCanvasCache()) {}

  render(masks: MaskDefinition[], args: MaskRenderArgs): void {
    if (masks.length === 0) {
      args.renderHost(args.destCtx)
      return
    }

    // ── 1. Render host content ─────────────────────────────────────────────
    const contentCanvas = createOffscreen(args.width, args.height)
    const contentCtx    = contentCanvas.getContext('2d')!
    args.renderHost(contentCtx)

    // ── 2. For each mask, composite with the content canvas ────────────────
    for (const mask of masks) {
      const maskLayer = args.getLayer(mask.maskLayerId)
      if (!maskLayer) continue

      // Mask silhouette → offscreen
      const maskCanvas = createOffscreen(args.width, args.height)
      const maskCtx    = maskCanvas.getContext('2d')!
      if (mask.feather && mask.feather > 0) {
        maskCtx.filter = `blur(${mask.feather}px)`
      }
      args.renderMask(maskLayer, maskCtx)
      maskCtx.filter = 'none'

      // Optional inversion via difference composite with full-opacity rect
      if (mask.inverted) {
        maskCtx.save()
        maskCtx.globalCompositeOperation = 'difference'
        maskCtx.fillStyle = '#FFFFFF'
        maskCtx.fillRect(0, 0, args.width, args.height)
        maskCtx.restore()
      }

      // Composite the mask onto the content canvas
      contentCtx.save()
      contentCtx.globalAlpha = mask.opacity ?? 1
      contentCtx.globalCompositeOperation =
          mask.mode === 'subtract' ? 'destination-out'
        : /* add | intersect */      'destination-in'
      contentCtx.drawImage(maskCanvas, 0, 0)
      contentCtx.restore()
    }

    // ── 3. Stamp final composite to destination ────────────────────────────
    args.destCtx.drawImage(contentCanvas, 0, 0)
  }
}

export const defaultMaskRenderer = new MaskRenderer()

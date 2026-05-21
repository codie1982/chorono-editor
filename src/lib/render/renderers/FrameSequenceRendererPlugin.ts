// ── FrameSequenceRendererPlugin (BL-07) ───────────────────────────────────────
//
// Draws the active sprite-sheet frame for a 'frameSequence' layer.
// Stateless: the frame index is derived from ctx.timeMs, so timeline scrubbing
// shows the exact frame. The canvas is already translated to the layer origin
// by CanvasRenderer (top-left of the layer box).

import type { Layer } from '@/lib/types'
import type { LayerRendererPlugin } from '@/lib/registry/LayerRendererRegistry'
import type { RenderContext } from '../RenderContext'
import type { FrameSequenceData } from '@/lib/types/media'
import { frameAtTime, frameRect } from '@/lib/frameSequence/frameMath'

/** Compute the destination box for a frame inside the layer, honouring objectFit. */
function fitRect(
  fit: FrameSequenceData['objectFit'],
  boxW: number, boxH: number,
  frameW: number, frameH: number,
): { dx: number; dy: number; dw: number; dh: number } {
  if (!frameW || !frameH || fit === 'fill') {
    return { dx: 0, dy: 0, dw: boxW, dh: boxH }
  }
  if (fit === 'none') {
    return { dx: (boxW - frameW) / 2, dy: (boxH - frameH) / 2, dw: frameW, dh: frameH }
  }
  // contain (default) or cover
  const scale = fit === 'cover'
    ? Math.max(boxW / frameW, boxH / frameH)
    : Math.min(boxW / frameW, boxH / frameH)
  const dw = frameW * scale
  const dh = frameH * scale
  return { dx: (boxW - dw) / 2, dy: (boxH - dh) / 2, dw, dh }
}

function renderFrameSequence(ctx: RenderContext, layer: Layer): void {
  const cfg = layer.frameSequence
  if (!cfg) return

  const el = ctx.assets.get(cfg.assetId)
  if (!el) return // not loaded yet — asset cache will trigger a re-render

  // Only images carry a usable sprite sheet (videos shouldn't be here).
  const img = el as HTMLImageElement
  if (!(img instanceof HTMLImageElement) || !img.complete || img.naturalWidth === 0) return

  const index = frameAtTime(ctx.timeMs, layer.startMs ?? 0, cfg)
  const { sx, sy, sw, sh } = frameRect(index, cfg)

  const boxW = layer.size?.width  ?? sw
  const boxH = layer.size?.height ?? sh
  const { dx, dy, dw, dh } = fitRect(cfg.objectFit ?? 'contain', boxW, boxH, sw, sh)

  // Clip to the layer box for cover/fill so frames don't bleed outside.
  ctx.canvas.save()
  ctx.canvas.beginPath()
  ctx.canvas.rect(0, 0, boxW, boxH)
  ctx.canvas.clip()
  ctx.canvas.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
  ctx.canvas.restore()
}

export const frameSequenceRendererPlugin: LayerRendererPlugin = {
  id: 'frameSequence',
  supports: (layer: Layer) => layer.type === 'frameSequence' && !!layer.frameSequence,
  render: renderFrameSequence,
}

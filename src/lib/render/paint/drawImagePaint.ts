import type { ImagePaint } from '../../types'
import type { AssetElementMap } from '../../asset/visual/AssetElementMap'
import { imagePlacement, type PaintBox } from '../../paint/imagePlacement'

/** Pattern paint from a borrowed ready image. Matrix maps source image pixels
 * into the caller's local paint box; no decode, source cache or ownership. */
export function imagePaintPattern(ctx: CanvasRenderingContext2D, paint: ImagePaint | undefined, box: PaintBox, assets?: AssetElementMap): CanvasPattern | null {
  if (!paint || !assets) return null
  const image = assets.get(paint.assetId)
  if (!image || !('naturalWidth' in image) || !image.complete) return null
  const placement = imagePlacement(paint, box, image.naturalWidth, image.naturalHeight)
  if (!placement) return null
  const pattern = ctx.createPattern(image, 'repeat')
  pattern?.setTransform(new DOMMatrix().translate(placement.x, placement.y).rotate(placement.rotationDeg).scale(placement.scale)
    .translate(-placement.width / 2, -placement.height / 2).scale(placement.width / image.naturalWidth, placement.height / image.naturalHeight))
  return pattern
}

/** Draw a borrowed ready image into the CURRENT clipped shape path. The caller
 * builds the path; no new beginPath/cache/canvas is created here, so its stroke
 * remains available. Shape/background opacity belongs to the caller. Missing,
 * wrong-kind, pending or invalid images paint transparent rather than black.
 * Shared asset service owns decoding/readiness/disposal; this function retains
 * nothing and preserves Canvas transform/alpha/clip on every return. */
export function drawImagePaint(ctx: CanvasRenderingContext2D, paint: ImagePaint | undefined,
  box: PaintBox, assets: AssetElementMap, fillRule: CanvasFillRule = 'nonzero'): void {
  if (!paint) return
  const image = assets.get(paint.assetId)
  if (!image || !('naturalWidth' in image) || !image.complete) return
  const placement = imagePlacement(paint, box, image.naturalWidth, image.naturalHeight)
  if (!placement) return
  ctx.save()
  try {
    if (paint.repeat) {
      const pattern = imagePaintPattern(ctx, paint, box, assets)
      if (!pattern) return
      ctx.fillStyle = pattern; ctx.fill(fillRule); return
    }
    ctx.clip(fillRule)
    ctx.translate(placement.x, placement.y)
    ctx.rotate(placement.rotationDeg * Math.PI / 180)
    ctx.scale(placement.scale, placement.scale)
    ctx.drawImage(image, -placement.width / 2, -placement.height / 2, placement.width, placement.height)
  } finally { ctx.restore() }
}

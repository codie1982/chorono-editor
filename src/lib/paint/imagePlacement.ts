import type { ObjectFit, ImagePaint } from '../types'
export interface PaintBox { x: number; y: number; width: number; height: number }
export interface FittedImage { dx: number; dy: number; dw: number; dh: number }

/** Pure centred aspect fitting, in destination px. The legacy image `none`
 * top-left placement remains caller policy; frame sheets use centred natural
 * size. Nonpositive/nonfinite sizes have no paint. No source mutation/resources. */
export function fitImage(fit: ObjectFit, width: number, height: number, sourceWidth: number, sourceHeight: number): FittedImage | null {
  if (![width, height, sourceWidth, sourceHeight].every(n => Number.isFinite(n) && n > 0)) return null
  if (fit === 'fill') return { dx: 0, dy: 0, dw: width, dh: height }
  const scale = fit === 'none' ? 1 : (fit === 'cover' ? Math.max : Math.min)(width / sourceWidth, height / sourceHeight)
  const dw = sourceWidth * scale, dh = sourceHeight * scale
  return { dx: (width - dw) / 2, dy: (height - dh) / 2, dw, dh }
}

/** Final local paint transform shared by clipped shapes, backgrounds and SVG.
 * Returns null for degenerate/untrusted input instead of emitting invalid GPU/
 * Canvas coordinates. Does not clamp/retime source. Scale must be positive. */
export function imagePlacement(paint: ImagePaint, box: PaintBox, sourceWidth: number, sourceHeight: number) {
  const fitted = fitImage(paint.fit ?? 'cover', box.width, box.height, sourceWidth, sourceHeight)
  const scale = paint.scale ?? 1, angle = paint.rotationDeg ?? 0, x = paint.offsetX ?? 0, y = paint.offsetY ?? 0
  if (!fitted || ![box.x, box.y, scale, angle, x, y].every(Number.isFinite) || scale <= 0) return null
  return { x: box.x + box.width / 2 + x, y: box.y + box.height / 2 + y,
    rotationDeg: angle, scale, width: fitted.dw, height: fitted.dh }
}

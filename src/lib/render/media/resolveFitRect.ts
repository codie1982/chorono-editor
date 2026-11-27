import type { ObjectFit } from '@/lib/types'

/** Additional axis-preserving fit modes used by Mesh2D texture authoring. */
export type ExtendedObjectFit = ObjectFit | 'fitX' | 'fitY'

export interface FittedRect {
  readonly dx: number
  readonly dy: number
  readonly dw: number
  readonly dh: number
}

/**
 * Fits a finite positive source rectangle into a finite positive destination.
 *
 * `alignmentX/Y` are normalized destination-space alignments: `0` is the
 * leading edge, `0.5` is centered and `1` is the trailing edge. `fill`
 * stretches both axes; `fitX`/`fitY` preserve source aspect ratio while
 * matching one destination axis. Invalid or degenerate input returns `null`
 * instead of publishing NaN geometry to a renderer.
 */
export function resolveFitRect(
  fit: ExtendedObjectFit,
  boxWidth: number,
  boxHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  alignmentX = 0.5,
  alignmentY = 0.5,
): FittedRect | null {
  if (![boxWidth, boxHeight, sourceWidth, sourceHeight, alignmentX, alignmentY].every(Number.isFinite)
      || boxWidth <= 0 || boxHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return null

  if (fit === 'fill') return { dx: 0, dy: 0, dw: boxWidth, dh: boxHeight }
  let scale = 1
  if (fit === 'contain') scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight)
  else if (fit === 'cover') scale = Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight)
  else if (fit === 'fitX') scale = boxWidth / sourceWidth
  else if (fit === 'fitY') scale = boxHeight / sourceHeight
  const dw = sourceWidth * scale
  const dh = sourceHeight * scale
  return {
    dx: (boxWidth - dw) * alignmentX,
    dy: (boxHeight - dh) * alignmentY,
    dw,
    dh,
  }
}

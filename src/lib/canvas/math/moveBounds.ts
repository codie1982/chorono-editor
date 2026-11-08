import { clamp } from './coordinateMath'

/** Keep a layer's visual box inside the composition, including centered geometry. */
export function clampMoveToComposition(
  x: number, y: number, width: number, height: number,
  compositionWidth: number, compositionHeight: number,
  boundsOffsetX = 0, boundsOffsetY = 0,
): { x: number; y: number } {
  const minX = 0 - boundsOffsetX
  const minY = 0 - boundsOffsetY
  return {
    x: clamp(x, minX, Math.max(minX, compositionWidth - width - boundsOffsetX)),
    y: clamp(y, minY, Math.max(minY, compositionHeight - height - boundsOffsetY)),
  }
}

/** Preserve the pointer's grab offset within the guide's generous hit strip.
 * An existing-guide click is selection only; a drag adds the world-coordinate
 * pointer delta to its exact source position. New ruler guides instead use the
 * absolute measured axis coordinate. Coordinates and results are composition px. */
export function guideDragPosition(axis: 'v' | 'h', origin: { x: number; y: number },
  point: { x: number; y: number }, existingPosition?: number): number {
  const channel = axis === 'v' ? 'x' : 'y'
  return existingPosition === undefined ? point[channel] : existingPosition + point[channel] - origin[channel]
}

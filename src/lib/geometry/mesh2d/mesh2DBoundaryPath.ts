import type { PathDefinition } from '../PathCommand'

/** Borrow validated boundary indices and matching local-pixel positions to
 * produce a closed path, including holes/islands. No triangulation or input
 * mutation; consumers use evenodd filling and own any deformation evaluation. */
export function mesh2DBoundaryPath(rings: readonly (readonly number[])[], positions: ArrayLike<number>): PathDefinition {
  return { closed: true, commands: rings.flatMap(ring => [
    ...ring.map((vertex, i) => ({ type: i === 0 ? 'M' as const : 'L' as const,
      x: positions[vertex * 2], y: positions[vertex * 2 + 1] })),
    { type: 'Z' as const },
  ]) }
}

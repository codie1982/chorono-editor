export interface SplineCoordinateAddress { readonly family: 'points' | 'handles'; readonly id: string; readonly component?: 'x' | 'y' }

/** Parse a stable layer-local spline coordinate address, never an array index
 * or topology field. Coordinates are layer-local px; whole records address
 * only x/y values, not their id/type/coupling metadata. Returns null for paths
 * outside this contract and does not resolve/mutate a particular spline. */
export function splineCoordinateAddress(path: string): SplineCoordinateAddress | null {
  const match = /^spline\.(points|handles)\.([\w-]+)(?:\.([xy]))?$/.exec(path)
  return match ? {family: match[1] as 'points' | 'handles', id: match[2], component: match[3] as 'x' | 'y' | undefined} : null
}

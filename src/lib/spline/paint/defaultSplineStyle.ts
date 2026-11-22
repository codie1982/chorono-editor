import type { ShapeStyle } from '../../types/style'

/** Fresh stroke-only paint for open and closed newly created Splines. Fill is
 * explicitly None, while the existing Properties selector can opt into Color,
 * Gradient or Image. No shared mutable style or existing scene migration. */
export function defaultSplineStyle(): ShapeStyle {
  return { fill: { type: 'none' }, stroke: { type: 'solid', color: '#60A5FA', width: 3,
    lineCap: 'round', lineJoin: 'round' } }
}

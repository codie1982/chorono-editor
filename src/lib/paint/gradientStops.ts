import type { GradientFill, GradientStop } from '../types'
import { parseAnimatableColor, animatableColorToCss } from '../color/ColorValue'

/** Preserve stable coincident-stop order, clamp positions and combine explicit
 * stop alpha with color alpha. Does not mutate source or interpolate colors;
 * Canvas/SVG retain their established color-space interpolation contracts. */
export function gradientStops(gradient: GradientFill): GradientStop[] {
  const stops = gradient.stops.map(stop => {
    const color = stop.opacity === undefined ? null : parseAnimatableColor(stop.color)
    if (stop.opacity !== undefined && !color) throw new Error('Gradient stop alpha requires a valid color.')
    return { offset: Math.max(0, Math.min(1, stop.offset)), color: color
      ? animatableColorToCss({ ...color, a: color.a * Math.max(0, Math.min(100, stop.opacity ?? 100)) / 100 }) : stop.color }
  }).sort((a, b) => a.offset - b.offset)
  if (gradient.type !== 'reflected') return stops
  return [...stops.map(stop => ({ ...stop, offset: (1 - stop.offset) / 2 })).reverse(),
    ...stops.map(stop => ({ ...stop, offset: (1 + stop.offset) / 2 }))]
}

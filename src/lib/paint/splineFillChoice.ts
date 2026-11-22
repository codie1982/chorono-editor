import type { ShapeFill, GradientFill } from '../types'
import { withFillType } from './paintSource'
export type SplineFillChoice = 'none' | 'solid' | 'gradient' | 'radial' | 'angle' | 'reflected' | 'diamond' | 'pattern' | 'image'

/** UI choice adapter over the existing Fill/Gradient/Image source contracts.
 * Pattern is repeating versioned image paint, preserving asset ownership and
 * placement. Switching kinds retains stop colors/alpha and inactive payloads. */
export function splineFillChoice(fill?: ShapeFill): SplineFillChoice {
  if (fill?.type === 'gradient') return fill.gradient?.type === 'linear' || !fill.gradient ? 'gradient' : fill.gradient.type
  if (fill?.type === 'image') return fill.image?.repeat ? 'pattern' : 'image'
  return fill?.type ?? 'none'
}
/** Return a fresh fill, without mutating authored stops or image placement. */
export function withSplineFillChoice(fill: ShapeFill | undefined, choice: SplineFillChoice): ShapeFill {
  if (['gradient', 'radial', 'angle', 'reflected', 'diamond'].includes(choice)) {
    const next = withFillType(fill, 'gradient')
    return { ...next, gradient: { ...next.gradient!, type: (choice === 'gradient' ? 'linear' : choice) as GradientFill['type'] } }
  }
  if (choice === 'pattern' || choice === 'image') {
    const next = withFillType(fill, 'image')
    return { ...next, image: { ...next.image!, repeat: choice === 'pattern',
      ...(!fill?.image && choice === 'pattern' ? { fit: 'contain', scale: .25 } : {}) } }
  }
  return withFillType(fill, choice as 'none' | 'solid')
}

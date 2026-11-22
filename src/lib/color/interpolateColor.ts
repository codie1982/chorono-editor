import type { ColorValue } from './ColorValue'

/** Legacy channel-wise sRGB/alpha interpolation, rounded to 8-bit channels.
 * Does not clamp t or mutate colors. Shared by particle and paint sampling. */
export function lerpColor(a: ColorValue, b: ColorValue, t: number): ColorValue {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
    a: Math.round(a.a + (b.a - a.a) * t),
  }
}


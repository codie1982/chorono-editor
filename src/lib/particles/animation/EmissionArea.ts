import type { Vec2 } from '@/lib/types'

/** Uniform perimeter distance, using a fixed pair of RNG slots just like the
 * rectangle interior sampler. Keeping slot consumption stable preserves all
 * later lifetime/size/color randomness when edge emission is toggled. */
export function sampleRectangleEmission(u: number, v: number, halfWidth: number, halfHeight: number, edge: boolean): Vec2 {
  const hw = Math.abs(halfWidth), hh = Math.abs(halfHeight)
  if (!edge) return { x: (u * 2 - 1) * hw, y: (v * 2 - 1) * hh }
  const width = hw * 2, height = hh * 2, perimeter = 2 * (width + height)
  if (!perimeter) return { x: 0, y: 0 }
  const distance = Math.max(0, Math.min(1, u)) * perimeter
  if (distance < width) return { x: -hw + distance, y: -hh }
  if (distance < width + height) return { x: hw, y: -hh + distance - width }
  if (distance < 2 * width + height) return { x: hw - (distance - width - height), y: hh }
  return { x: -hw, y: hh - (distance - 2 * width - height) }
}

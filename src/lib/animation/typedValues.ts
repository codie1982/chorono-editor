import type { AnimatableValue, ColorValue, Vec2, Track } from '../types'

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const clamp = (value: number, max = 255) => Math.max(0, Math.min(max, value))
export { isVec2 } from '../geometry/CoordinateSystem'
export { isColorValue, parseAnimatableColor, animatableColorToCss } from '../color/ColorValue'
import { isVec2 } from '../geometry/CoordinateSystem'
import { isColorValue, parseAnimatableColor, animatableColorToCss } from '../color/ColorValue'
export const isColorTarget = (target: string) => /(?:^|\.)(?:color|fillColor|strokeColor|backgroundColor|textColor)$/i.test(target)
export const isDiscreteTarget = (target: string) => /(?:^|\.)(?:hidden|locked|solo|pinned|muted|loop|enabled|tappable|draggable)$/.test(target) || /\.text\.value$/.test(target)

/** Shared gate for scalar curve editing, signal controllers/modifiers and
 * numeric RDP baking. Packed RGB is a color even though its storage is numeric. */
export function isScalarNumericTrack(track: Track, staticValue?: unknown): boolean {
  return !isColorTarget(track.target) && !isDiscreteTarget(track.target)
    && (staticValue === undefined || finite(staticValue))
    && track.keyframes.every(key => finite(key.value))
}
/** Discrete values hold their leading key. Numeric signal modifiers are
 * deliberately separate; color channels and vectors never enter that stack. */
export function interpolateAnimatableValues(from: AnimatableValue, to: AnimatableValue, t: number, target = ''): AnimatableValue {
  if (isColorTarget(target) || isColorValue(from) || isColorValue(to)) {
    const a = parseAnimatableColor(from), b = parseAnimatableColor(to)
    if (a && b) {
      const color = { r: clamp(a.r + (b.r - a.r) * t), g: clamp(a.g + (b.g - a.g) * t), b: clamp(a.b + (b.b - a.b) * t), a: clamp(a.a + (b.a - a.a) * t) }
      if (typeof from === 'number' && typeof to === 'number') return Math.round(color.r) * 65536 + Math.round(color.g) * 256 + Math.round(color.b)
      return isColorValue(from) && isColorValue(to) ? color : animatableColorToCss(color)
    }
    return from
  }
  if (finite(from) && finite(to)) return from + (to - from) * t
  if (isVec2(from) && isVec2(to)) return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  return from
}

type ValueFamily = 'number' | 'string' | 'boolean' | 'color' | 'vector'
function valueFamily(value: unknown): ValueFamily | null {
  if (finite(value)) return 'number'
  if (typeof value === 'string' || typeof value === 'boolean') return typeof value as 'string' | 'boolean'
  if (isColorValue(value) && Object.keys(value).length === 4 && [value.r, value.g, value.b, value.a].every(channel => channel >= 0 && channel <= 255)) return 'color'
  if (isVec2(value) && Object.keys(value).length === 2) return 'vector'
  return null
}

/** Validate data families without a closed property whitelist. Existing static
 * leaves constrain their animation type; optional/geometry paths remain usable.
 * Scalar signal processors have no defined color/vector/discrete semantics. */
export function assertTrackValues(track: Track, staticValue?: unknown): void {
  const staticFamily = valueFamily(staticValue)
  const color = isColorTarget(track.target) || staticFamily === 'color'
  const families = track.keyframes.map(key => valueFamily(key.value))
  if (families.some(family => family === null)) throw new Error(`Invalid animated value for '${track.target}'`)
  if (color) {
    if (track.keyframes.some(key => !parseAnimatableColor(key.value))) throw new Error(`Invalid animated color for '${track.target}'`)
  } else {
    const expected = staticFamily ?? families[0]
    if (expected && families.some(family => family !== expected)) throw new Error(`Incompatible or mixed animated value types for '${track.target}'`)
    if (isDiscreteTarget(track.target) && expected && expected !== (/\.text\.value$/.test(track.target) ? 'string' : 'boolean')) throw new Error(`Invalid discrete animated value for '${track.target}'`)
  }
  const scalar = !color && (staticFamily ?? families[0] ?? (isDiscreteTarget(track.target) ? 'boolean' : 'number')) === 'number'
  const numericProcessing = (track.controller && track.controller.type !== 'keyframe') || !!track.multiplierCurve
    || track.modifiers?.some(modifier => modifier.enabled)
    || track.keyframes.some(key => key.segmentModifiers?.some(modifier => modifier.enabled))
  if (!scalar && numericProcessing) throw new Error(`Scalar numeric modifiers/controllers are unsupported for '${track.target}'`)
}

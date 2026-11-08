import type { AnimatableValue, ColorValue, Vec2, Track } from '../types'

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const clamp = (value: number, max = 255) => Math.max(0, Math.min(max, value))
export const isVec2 = (value: unknown): value is Vec2 => !!value && typeof value === 'object' && finite((value as Vec2).x) && finite((value as Vec2).y)
export const isColorValue = (value: unknown): value is ColorValue => !!value && typeof value === 'object'
  && ['r', 'g', 'b', 'a'].every(key => finite((value as unknown as Record<string, unknown>)[key]))
export const isColorTarget = (target: string) => /(?:^|\.)(?:color|fillColor|strokeColor|backgroundColor|textColor)$/i.test(target)
export const isDiscreteTarget = (target: string) => /(?:^|\.)(?:hidden|locked|solo|pinned|muted|loop|enabled|tappable|draggable)$/.test(target) || /\.text\.value$/.test(target)

/** Shared gate for scalar curve editing, signal controllers/modifiers and
 * numeric RDP baking. Packed RGB is a color even though its storage is numeric. */
export function isScalarNumericTrack(track: Track, staticValue?: unknown): boolean {
  return !isColorTarget(track.target) && !isDiscreteTarget(track.target)
    && (staticValue === undefined || finite(staticValue))
    && track.keyframes.every(key => finite(key.value))
}
const namedColors: Record<string, string> = { transparent: '#00000000', black: '#000000', silver: '#c0c0c0', gray: '#808080', white: '#ffffff',
  maroon: '#800000', red: '#ff0000', purple: '#800080', fuchsia: '#ff00ff', green: '#008000', lime: '#00ff00', olive: '#808000',
  yellow: '#ffff00', navy: '#000080', blue: '#0000ff', teal: '#008080', aqua: '#00ffff', orange: '#ffa500', rebeccapurple: '#663399' }

/** Canonical ColorValue channels are 0..255, including alpha. No DOM is needed
 * for frame evaluation. Numeric colors are the legacy packed 0xRRGGBB form. */
export function parseAnimatableColor(value: unknown): ColorValue | null {
  if (isColorValue(value)) return { r: clamp(value.r), g: clamp(value.g), b: clamp(value.b), a: clamp(value.a) }
  if (finite(value) && Number.isInteger(value) && value >= 0 && value <= 0xffffff) return { r: value >> 16 & 255, g: value >> 8 & 255, b: value & 255, a: 255 }
  if (typeof value !== 'string') return null
  let input = value.trim().toLowerCase()
  input = namedColors[input] ?? input
  const hex = input.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/)
  if (hex) {
    const raw = hex[1].length <= 4 ? hex[1].split('').map(channel => channel + channel).join('') : hex[1]
    return { r: parseInt(raw.slice(0, 2), 16), g: parseInt(raw.slice(2, 4), 16), b: parseInt(raw.slice(4, 6), 16), a: raw.length === 8 ? parseInt(raw.slice(6, 8), 16) : 255 }
  }
  const rgb = input.match(/^rgba?\((.*)\)$/)
  if (rgb) {
    const parts = rgb[1].split(/\s*[,/]\s*|\s+/).filter(Boolean)
    if (parts.length < 3 || parts.length > 4) return null
    const channel = (part: string, alpha = false) => {
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)%?$/.test(part)) return NaN
      const value = parseFloat(part)
      return clamp(part.endsWith('%') ? value * 255 / 100 : alpha ? value * 255 : value)
    }
    const channels = parts.map((part, index) => channel(part, index === 3))
    if (!channels.every(Number.isFinite)) return null
    return { r: channels[0], g: channels[1], b: channels[2], a: channels[3] ?? 255 }
  }
  const hsl = input.match(/^hsla?\((.*)\)$/)
  if (hsl) {
    const parts = hsl[1].split(/\s*[,/]\s*|\s+/).filter(Boolean)
    if (parts.length < 3 || parts.length > 4 || !parts[1].endsWith('%') || !parts[2].endsWith('%')) return null
    const hue = Number(parts[0].replace(/deg$/, '')), s = clamp(parseFloat(parts[1]), 100) / 100, l = clamp(parseFloat(parts[2]), 100) / 100
    const a = parts[3] === undefined ? 255 : parts[3].endsWith('%') ? parseFloat(parts[3]) * 255 / 100 : Number(parts[3]) * 255
    if (![hue, s, l, a].every(Number.isFinite)) return null
    const h = ((hue % 360) + 360) % 360 / 30, chroma = (1 - Math.abs(2 * l - 1)) * s
    const channel = (n: number) => l - chroma / 2 * Math.max(-1, Math.min((n + h) % 12 - 3, 9 - (n + h) % 12, 1))
    return { r: channel(0) * 255, g: channel(8) * 255, b: channel(4) * 255, a: clamp(a) }
  }
  return null
}
export function animatableColorToCss(value: unknown, fallback = '#000000'): string {
  const color = parseAnimatableColor(value)
  if (!color) return typeof value === 'string' ? value : fallback
  return `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${Number((color.a / 255).toFixed(6))})`
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

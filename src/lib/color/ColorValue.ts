/** Serializable unpremultiplied RGBA channels in 0..255, including alpha.
 * Pure color calculations use this record; renderer/scene adapters own color
 * space, CSS and GPU conversion. No native/browser resources are retained. */
export interface ColorValue { r: number; g: number; b: number; a: number }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const clamp = (value: number, max = 255) => Math.max(0, Math.min(max, value))
/** Legacy structural guard; channel normalization belongs to the parser. */
export const isColorValue = (value: unknown): value is ColorValue => !!value && typeof value === 'object'
  && ['r', 'g', 'b', 'a'].every(key => finite((value as unknown as Record<string, unknown>)[key]))

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
  input = Object.hasOwn(namedColors, input) ? namedColors[input] : input
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

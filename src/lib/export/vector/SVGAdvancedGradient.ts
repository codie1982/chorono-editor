import type { GradientFill } from '../../types'
import type { PaintBox } from '../../paint/imagePlacement'
import { gradientStops } from '../../paint/gradientStops'
import { parseAnimatableColor, animatableColorToCss } from '../../color/ColorValue'
import { lerpColor } from '../../color/interpolateColor'
import { escapeXml, num } from './SVGValues'

/** SVG has no portable conic primitive. Angle is deterministically tessellated
 * into 720 colored sectors (exporter reports this approximation); Canvas/raster
 * keeps its continuous native conic gradient. Diamond uses four exact native
 * linear-gradient quadrants, matching the Canvas |x|+|y| construction. Source
 * box units are local pixels. No DOM, image decode, IO or retained resources. */
export function advancedGradientDef(id: string, gradient: GradientFill, box: PaintBox, outsetPx = 0): string {
  const stops = gradientStops(gradient)
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const pad = Math.max(0, outsetPx), x = box.x - pad, y = box.y - pad, w = box.width + pad * 2, h = box.height + pad * 2
  const start = `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">`
  if (gradient.type === 'diamond') {
    const stopDefs = stops.map(stop => `<stop offset="${stop.offset}" stop-color="${escapeXml(stop.color)}"/>`).join('')
    const reach = 2 * (w + h) / Math.min(box.width, box.height) + 2
    let definitions = '', quarters = '', index = 0
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const key = `${id}_q${index++}`
      definitions += `<linearGradient id="${key}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${sx / 2}" y2="${sy / 2}">${stopDefs}</linearGradient>`
      quarters += `<rect x="${sx < 0 ? -reach : 0}" y="${sy < 0 ? -reach : 0}" width="${reach}" height="${reach}" fill="url(#${key})"/>`
    }
    return definitions + start + `<g transform="translate(${cx} ${cy}) scale(${box.width / 2} ${box.height / 2}) rotate(${gradient.angle ?? 0})">${quarters}</g></pattern>`
  }
  const colors = stops.map(stop => parseAnimatableColor(stop.color))
  if (colors.some(color => !color)) throw new Error('Angle gradient SVG requires parseable stop colors.')
  const sample = (t: number) => {
    let index = 0
    while (index + 1 < stops.length && stops[index + 1].offset <= t) index++
    const right = Math.min(stops.length - 1, index + 1), gap = stops[right].offset - stops[index].offset
    return animatableColorToCss(lerpColor(colors[index]!, colors[right]!, gap > 0 ? Math.max(0, Math.min(1, (t - stops[index].offset) / gap)) : 0))
  }
  const radius = Math.hypot(w, h), angle = (gradient.angle ?? 0) * Math.PI / 180
  const sectors = Array.from({ length: 720 }, (_, i) => {
    const a = angle + i / 720 * Math.PI * 2, b = angle + (i + 1) / 720 * Math.PI * 2
    const points = `${num(cx, 6)},${num(cy, 6)} ${num(cx + Math.cos(a) * radius, 6)},${num(cy + Math.sin(a) * radius, 6)} ${num(cx + Math.cos(b) * radius, 6)},${num(cy + Math.sin(b) * radius, 6)}`
    return `<polygon points="${points}" fill="${escapeXml(sample((i + .5) / 720))}"/>`
  }).join('')
  return start + sectors + '</pattern>'
}

import type { PaintBox } from './imagePlacement'
import type { ShapeStroke } from '../types'
export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

/** Legacy arrays remain enabled when dashEnabled is omitted. No source mutation. */
export function activeStrokeDash(stroke?: ShapeStroke): number[] { return stroke?.dashEnabled === false ? [] : stroke?.dashArray ?? [] }
/** Derive a UI style from actual paint settings; zero-length round caps are dots. */
export function strokeStyle(stroke?: ShapeStroke): StrokeStyle {
  const sequence = activeStrokeDash(stroke)
  return !sequence.length ? 'solid' : sequence[0] === 0 && stroke?.lineCap === 'round' ? 'dotted' : 'dashed'
}
/** Set a style while retaining an inactive custom sequence. Width-derived
 * defaults are local px; subsequent edits are explicit lengths, not multipliers. */
export function withStrokeStyle(stroke: ShapeStroke, style: StrokeStyle): ShapeStroke {
  if (style === 'solid') return { ...stroke, dashEnabled: false }
  const width = Math.max(1, stroke.width)
  if (style === 'dotted') return { ...stroke, dashEnabled: true, dashArray: [0, width * 2], lineCap: 'round' }
  return { ...stroke, dashEnabled: true, dashArray: stroke.dashArray?.length && stroke.dashArray[0] > 0 ? stroke.dashArray : [width * 3, width * 2] }
}
/** Bounded comma/space-separated Canvas dash sequence. Odd lengths are valid
 * (Canvas repeats them); all-zero, negative and non-finite entries refuse. */
export function parseStrokeDash(text: string): number[] {
  const values = text.trim().split(/[,\s]+/).map(Number)
  if (!text.trim() || values.length > 256 || values.some(value => !Number.isFinite(value) || value < 0) || !values.some(value => value > 0)) throw new Error('Use 1–256 non-negative dash/gap lengths, with at least one positive length.')
  return values
}

/** Paint coordinates for a horizontal/vertical stroke with zero-area path
 * bounds. Expand only degenerate dimensions around their original center,
 * retaining the authored direction and giving image/gradient adapters a valid box. */
export function strokePaintBox(box: PaintBox, width: number): PaintBox {
  const w = box.width > 1e-9 ? box.width : Math.max(1, width), h = box.height > 1e-9 ? box.height : Math.max(1, width)
  return { x: box.x - (w - box.width) / 2, y: box.y - (h - box.height) / 2, width: w, height: h }
}

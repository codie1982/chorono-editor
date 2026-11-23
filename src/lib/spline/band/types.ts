import type { SplinePathData } from '../../types/spline'
import type { FlattenedContour } from '../../geometry/flattenPathContours'

/** Source-local px, independent of layer/parent TRS and viewport zoom. Inside
 * and Outside require complete closed material boundaries; open chains use
 * Center/Left/Right. Output is explicitly polygonal, never mislabeled Bézier. */
export interface SplineBandSettings {
  widthPx: number; alignment: 'center' | 'inside' | 'outside' | 'left' | 'right'
  cap: 'butt' | 'round' | 'square'; join: 'miter' | 'round' | 'bevel'; miterLimit: number
  dashEnabled: boolean; dashArray: number[]; dashOffset: number
  spacingPx: number; tolerancePx: number
}
export interface BandChain { objectId: string; contourId: string; edgeIds: string[]; closed: boolean }
export interface SplineBandRequest { data: SplinePathData; chains: BandChain[]; settings: SplineBandSettings }
export interface SplineBandResult {
  objects: { sourceObjectId?: string; name: string; contours: FlattenedContour[] }[]; inputVertices: number; outputVertices: number; bevelFallbacks: number; tolerancePx: number
}
export const defaultBandSettings: SplineBandSettings = { widthPx: 10, alignment: 'center', cap: 'butt', join: 'miter', miterLimit: 4,
  dashEnabled: false, dashArray: [10, 5], dashOffset: 0, spacingPx: 20, tolerancePx: .25 }
/** Validate before worker allocation and again inside the domain backend. No
 * coercion, silent clamping or inferred whole-object selection. */
export function assertBandSettings(s: SplineBandSettings): void {
  if (!s || !Number.isFinite(s.widthPx) || s.widthPx < .02 || s.widthPx > 20000) throw new Error('Outline width must be 0.02–20000 local px.')
  if (!['center', 'inside', 'outside', 'left', 'right'].includes(s.alignment) || !['butt', 'round', 'square'].includes(s.cap) || !['miter', 'round', 'bevel'].includes(s.join)) throw new Error('Invalid Outline alignment, cap or join.')
  if (!Number.isFinite(s.miterLimit) || s.miterLimit < 1 || s.miterLimit > 100) throw new Error('Outline miter limit must be 1–100.')
  if (!Number.isFinite(s.spacingPx) || s.spacingPx < .1 || s.spacingPx > 10000 || !Number.isFinite(s.tolerancePx) || s.tolerancePx < .05 || s.tolerancePx > 5) throw new Error('Outline spacing must be 0.1–10000 and tolerance 0.05–5 local px.')
  if (typeof s.dashEnabled !== 'boolean' || !Number.isFinite(s.dashOffset) || Math.abs(s.dashOffset) > 1e7 || !Array.isArray(s.dashArray)
    || !s.dashArray.length || s.dashArray.length > 256 || s.dashArray.some(n => !Number.isFinite(n) || n < 0) || !s.dashArray.some(n => n > 0)) throw new Error('Invalid Outline dash/gap sequence or offset.')
}

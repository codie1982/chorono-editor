import type { PathDefinition } from '../../geometry/PathCommand'
import type { FlattenedContour } from '../../geometry/flattenPathContours'

export type OutlineSide = 'left' | 'right' | 'both' | 'inside' | 'outside'
export interface OutlineSettings { distancePx: number; side: OutlineSide; join: 'miter' | 'bevel' | 'round'; miterLimit: number; tolerancePx: number }
/** World-space source Object, including unselected sibling contours for hole
 * classification. indices identifies complete contours, never partial edges. */
export interface OutlineInput { name: string; path: PathDefinition; fillRule: 'evenodd' | 'nonzero'; indices: number[] }
export interface OutlineRequest extends OutlineSettings { inputs: OutlineInput[] }
export interface OutlineObject { name: string; contours: FlattenedContour[] }
export interface OutlineResult { objects: OutlineObject[]; inputVertices: number; outputVertices: number; bevelFallbacks: number; tolerancePx: number }
export interface OutlineExecutor { execute(request: OutlineRequest, signal: AbortSignal): Promise<OutlineResult> }
export const OUTLINE_LIMITS = Object.freeze({ objects: 8, contours: 32, commands: 2048, inputVertices: 4096, outputVertices: 8192 })

/** Reject invalid authoring parameters before allocating geometry or a worker. */
export function assertOutlineSettings(settings: OutlineSettings): void {
  if (!Number.isFinite(settings.distancePx) || settings.distancePx <= 0 || settings.distancePx > 10000) throw new Error('Offset distance must be greater than 0 and at most 10,000 composition px.')
  if (!['left', 'right', 'both', 'inside', 'outside'].includes(settings.side) || !['miter', 'bevel', 'round'].includes(settings.join)) throw new Error('Invalid Offset direction or join.')
  if (!Number.isFinite(settings.miterLimit) || settings.miterLimit < 1 || settings.miterLimit > 100) throw new Error('Miter limit must be 1–100.')
  if (!Number.isFinite(settings.tolerancePx) || settings.tolerancePx < .05 || settings.tolerancePx > 5) throw new Error('Offset tolerance must be 0.05–5 composition px.')
}

import type { CornerSource, CornerResult } from '../corners'
import type { Vec2 } from '../../geometry/CoordinateSystem'

export interface FilletSettings { radiusPx: number }
export interface FilletRequest extends CornerSource, FilletSettings {}
export interface FilletArc { pointId: string; center: Vec2; radiusPx: number; sweepRad: number; radialErrorBoundPx: number; tangentErrorRad: number }
export interface FilletResult extends CornerResult { arcs: FilletArc[] }
export interface FilletExecutor { execute(request: FilletRequest, signal: AbortSignal): Promise<FilletResult> }
export const FILLET_LIMITS = Object.freeze({ points: 64 })
/** Absolute composition-pixel radius; no silent clamping to available edges. */
export function assertFilletSettings(settings: FilletSettings): void {
  if (!Number.isFinite(settings.radiusPx) || settings.radiusPx < .1 || settings.radiusPx > 10000) throw new Error('Fillet radius must be 0.1–10,000 composition px.')
}

import { selectSplineCorners } from '../corners'
import type { SplinePathData } from '../../types/spline'
import type { PathDefinition } from '../../geometry/PathCommand'
import type { Vec2 } from '../../geometry/CoordinateSystem'

export interface ChamferSettings { distancePx: number }
/** Serializable worker input: source stays layer-local; matrix is the captured
 * complete local→composition affine transform, including animated ancestors. */
export interface ChamferRequest extends ChamferSettings { data: SplinePathData; pointIds: string[]; matrix: [number, number, number, number, number, number] }
export interface ChamferCut { removedId: string; incomingId: string; outgoingId: string; bevelId: string }
export interface ChamferResult { data: SplinePathData; path: PathDefinition; cuts: ChamferCut[]; markers: Vec2[] }
export interface ChamferExecutor { execute(request: ChamferRequest, signal: AbortSignal): Promise<ChamferResult> }
export { CORNER_LIMITS as CHAMFER_LIMITS } from '../corners'

/** Finite positive distance, measured along each edge in composition px.
 * Tiny cuts below 0.1px are refused rather than exceeding the 0.005px length
 * lookup tolerance. Values are never silently clamped to an edge length. */
export function assertChamferSettings(settings: ChamferSettings): void {
  if (!Number.isFinite(settings.distancePx) || settings.distancePx < .1 || settings.distancePx > 10000) throw new Error('Chamfer distance must be 0.1–10,000 composition px.')
}

/** Selected corners in source order. Open endpoints have only one adjacent
 * edge and refuse as a batch; Point mode never promotes an empty selection. */
export function chamferSelection(data: SplinePathData, ids: readonly string[]): string[] {
  return selectSplineCorners(data, ids, 'Chamfer')
}

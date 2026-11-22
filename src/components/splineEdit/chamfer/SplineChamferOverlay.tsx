import { SplineCornerOverlay } from '../preview/SplineCornerOverlay'
import type { ChamferResult } from '@/lib/spline/chamfer'
/** Compatibility wrapper over the shared read-only corner overlay. */
export function SplineChamferOverlay(props: { result: ChamferResult; zoom: number; width: number; height: number }) {
  return <SplineCornerOverlay {...props} label="Spline Chamfer preview" />
}

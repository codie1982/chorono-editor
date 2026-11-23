import { SplineModifier } from './SplineModifier'
import type { SplinePathData } from '../../types/spline'
import { targetSetting } from '../settings'
import { sharpSplineCornerIds } from '../../spline/corners'

/** Shared target policy for sharp-corner modifiers. Empty selection means all
 * currently sharp interior corners; explicit IDs are never silently filtered.
 * Native solvers own feasibility, tangent/overlap and complete-boundary checks. */
export abstract class CornerModifier extends SplineModifier {
  protected targets(data: SplinePathData): string[] {
    const selected = targetSetting(this.settings, 'pointIds')
    if (selected.length) return selected
    const ids = sharpSplineCornerIds(data)
    if (!ids.length) throw new Error('No sharp interior corners. Select point targets or change the upstream geometry.')
    return ids
  }
}

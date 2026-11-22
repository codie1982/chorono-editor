import { SplineModifier } from './SplineModifier'
import type { SplinePathData } from '../../types/spline'
import { targetSetting } from '../settings'
import { segmentControls } from '../../spline/corners'

/** Shared target policy for sharp-corner modifiers. Empty selection means all
 * currently sharp interior corners; explicit IDs are never silently filtered.
 * Native solvers own feasibility, tangent/overlap and complete-boundary checks. */
export abstract class CornerModifier extends SplineModifier {
  protected targets(data: SplinePathData): string[] {
    const selected = targetSetting(this.settings, 'pointIds')
    if (selected.length) return selected
    const incoming = new Map(Object.values(data.segments).map(s => [s.toPointId, s]))
    const outgoing = new Map(Object.values(data.segments).map(s => [s.fromPointId, s]))
    const ids = Object.keys(data.points).filter(id => {
      const a = incoming.get(id), b = outgoing.get(id)
      if (!a || !b) return false
      const ca = segmentControls(data, a.id), cb = segmentControls(data, b.id), point = data.points[id]
      const left = ca.slice(0, -1).reverse().find(p => Math.hypot(p.x - point.x, p.y - point.y) > 1e-8)
      const right = cb.slice(1).find(p => Math.hypot(p.x - point.x, p.y - point.y) > 1e-8)
      if (!left || !right) return false
      const ax = point.x - left.x, ay = point.y - left.y, bx = right.x - point.x, by = right.y - point.y
      return Math.abs(ax * by - ay * bx) > 1e-6 * Math.hypot(ax, ay) * Math.hypot(bx, by)
    })
    if (!ids.length) throw new Error('No sharp interior corners. Select point targets or change the upstream geometry.')
    return ids
  }
}

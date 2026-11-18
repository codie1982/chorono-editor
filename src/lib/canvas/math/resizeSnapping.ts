import type { ResizeHandle } from './resizeMath'
import type { SnapResult, Vec2 } from '@/lib/snap/SnapCandidate'
import type { Guide } from '@/lib/snap/AlignmentGuides'

/** Position of a corner/edge midpoint in the supplied coordinate-space bounds. */
export function resizeHandlePoint(box: { x: number; y: number; width: number; height: number }, handle: ResizeHandle): Vec2 {
  return { x: box.x + (handle.includes('w') ? 0 : handle.includes('e') ? box.width : box.width / 2),
    y: box.y + (handle.includes('n') ? 0 : handle.includes('s') ? box.height : box.height / 2) }
}

/** Acquire a displayed handle, not the physical pointer/grab offset. Free
 * corners may snap both world axes. Side/aspect-constrained handles move only
 * along `direction`; choose the reachable axis hit with the least world travel
 * inside `radius`. Near-parallel constraints never cause a distant jump.
 * All inputs/results use composition pixels. No source/geometry is mutated. */
export function snapResizeHandle(point: Vec2, direction: Vec2 | null, radius: number,
  resolve: (point: Vec2) => SnapResult): { point: Vec2; guides: Guide[] } {
  const snap = resolve(point)
  if (!direction) return { point: snap.point, guides: snap.guides }
  let best = Infinity, result = point
  const length = Math.hypot(direction.x, direction.y)
  if (length < 1e-12) return { point, guides: [] }
  for (const guide of snap.guides) {
    const axis = guide.axis === 'v' ? 'x' : 'y', component = direction[axis]
    if (Math.abs(component) < 1e-10 * length) continue
    const t = (guide.position - point[axis]) / component, distance = Math.abs(t) * length
    if (distance <= radius && distance < best) {
      best = distance; result = { x: point.x + t * direction.x, y: point.y + t * direction.y }
    }
  }
  return { point: result, guides: reachedResizeGuides(result, snap.guides) }
}

/** Retain only truly reached lines after aspect/min/max/axis constraints. */
export function reachedResizeGuides(point: Vec2, guides: readonly Guide[]): Guide[] {
  return guides.filter(guide => Math.abs(point[guide.axis === 'v' ? 'x' : 'y'] - guide.position) < 1e-5)
}

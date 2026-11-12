import type { PathBounds } from '../computePathBounds'

export interface SelectionNeighborItem {
  readonly id: string
  readonly bounds: Readonly<PathBounds>
}

export interface SelectionNeighbor {
  readonly axis: 'x' | 'y'
  readonly before: SelectionNeighborItem
  readonly after: SelectionNeighborItem
  /** Signed facing-edge separation. Negative means AABB overlap, not distance. */
  readonly gap: number
  readonly from: Readonly<{ x: number; y: number }>
  readonly to: Readonly<{ x: number; y: number }>
}

const EPSILON = 1e-7

/** Find nearest cardinal neighbors among finite composition-space geometry
 * AABBs. The orthogonal projections must overlap by >1e-7 px: corner contact
 * and diagonal pairs are excluded. Each item chooses at most one neighbor in
 * each direction; reciprocal choices are deduplicated. Positive gaps rank by
 * edge distance. Overlaps rank as zero separation, then by center distance and
 * finally authored item order. Equal centers use authored order for direction.
 *
 * O(n²) time / O(n) result storage; callers bound n before geometric evaluation.
 * Output order is stable: x before y, then authored item iteration. The function
 * is pure, never mutates/sorts input, and does not claim polygon clearance for
 * rotated/curved objects. Invalid bounds must be filtered by the owning caller.
 */
export function selectionNeighbors(items: readonly SelectionNeighborItem[]): SelectionNeighbor[] {
  const pairs = new Map<string, SelectionNeighbor>()
  for (const axis of ['x', 'y'] as const) {
    const cross = axis === 'x' ? 'y' : 'x', length = axis === 'x' ? 'width' : 'height'
    const crossLength = axis === 'x' ? 'height' : 'width'
    for (let i = 0; i < items.length; i++) {
      const source = items[i], a = source.bounds, centerA = a[axis] + a[length] / 2
      const nearest = new Map<-1 | 1, { item: SelectionNeighborItem; index: number; gap: number; centerDistance: number }>()
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue
        const target = items[j], b = target.bounds, centerB = b[axis] + b[length] / 2
        if (Math.min(a[cross] + a[crossLength], b[cross] + b[crossLength]) - Math.max(a[cross], b[cross]) <= EPSILON) continue
        const direction = centerB > centerA + EPSILON || (Math.abs(centerB - centerA) <= EPSILON && j > i) ? 1 : -1
        const gap = direction === 1 ? b[axis] - a[axis] - a[length] : a[axis] - b[axis] - b[length]
        const score = Math.max(0, gap), distance = Math.abs(centerB - centerA), previous = nearest.get(direction)
        if (!previous || score < Math.max(0, previous.gap) - EPSILON
            || (Math.abs(score - Math.max(0, previous.gap)) <= EPSILON && distance < previous.centerDistance - EPSILON)) {
          nearest.set(direction, { item: target, index: j, gap, centerDistance: distance })
        }
      }
      for (const [direction, neighbor] of Array.from(nearest)) {
        const before = direction === 1 ? source : neighbor.item, after = direction === 1 ? neighbor.item : source
        const key = `${axis}:${Math.min(i, neighbor.index)}:${Math.max(i, neighbor.index)}`
        if (pairs.has(key)) continue
        const start = before.bounds, end = after.bounds
        const crossAt = (Math.max(start[cross], end[cross]) + Math.min(start[cross] + start[crossLength], end[cross] + end[crossLength])) / 2
        pairs.set(key, { axis, before, after, gap: neighbor.gap,
          from: axis === 'x' ? { x: start.x + start.width, y: crossAt } : { x: crossAt, y: start.y + start.height },
          to: axis === 'x' ? { x: end.x, y: crossAt } : { x: crossAt, y: end.y } })
      }
    }
  }
  return Array.from(pairs.values())
}

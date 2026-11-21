import type {
  FractureFragmentAdjacency,
  FracturePoint2D,
  FractureRegionFragmentGeometry,
} from '@/lib/types/fracture'

const LINE_TOLERANCE = 1e-7

/**
 * Finds shared non-zero boundary segments between FRACTURE1 fragments.
 *
 * All rings use source-local composition pixels. Collinear partial overlaps
 * are measured even when one side subdivides an edge differently. Point-only
 * contact is ignored. Results are detached, sorted by fragment ids and contain
 * one accumulated record per unordered pair. Instances hold no mutable state.
 */
export class FractureFragmentAdjacencyBuilder {
  build(fragments: readonly FractureRegionFragmentGeometry[]): readonly FractureFragmentAdjacency[] {
    const result: FractureFragmentAdjacency[] = []
    for (let left = 0; left < fragments.length; left++) {
      for (let right = left + 1; right < fragments.length; right++) {
        const length = sharedBoundaryLength(fragments[left], fragments[right])
        if (length <= LINE_TOLERANCE) continue
        const [fragmentAId, fragmentBId] = [fragments[left].id, fragments[right].id].sort()
        result.push(Object.freeze({ fragmentAId, fragmentBId, sharedLengthPx: clean(length) }))
      }
    }
    return Object.freeze(result.sort((a, b) => a.fragmentAId.localeCompare(b.fragmentAId)
      || a.fragmentBId.localeCompare(b.fragmentBId)))
  }
}

function sharedBoundaryLength(
  left: FractureRegionFragmentGeometry,
  right: FractureRegionFragmentGeometry,
): number {
  let length = 0
  const rightSegments = segments(right)
  segments(left).forEach(([start, end]) => {
    rightSegments.forEach(([otherStart, otherEnd]) => {
      length += collinearOverlap(start, end, otherStart, otherEnd)
    })
  })
  return length
}

function segments(fragment: FractureRegionFragmentGeometry): [FracturePoint2D, FracturePoint2D][] {
  return fragment.boundaryRings.flatMap(ring => ring.points.map((point, index) => (
    [point, ring.points[(index + 1) % ring.points.length]] as [FracturePoint2D, FracturePoint2D]
  )))
}

function collinearOverlap(
  a: FracturePoint2D,
  b: FracturePoint2D,
  c: FracturePoint2D,
  d: FracturePoint2D,
): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length <= LINE_TOLERANCE) return 0
  const distanceC = Math.abs(dx * (c.y - a.y) - dy * (c.x - a.x)) / length
  const distanceD = Math.abs(dx * (d.y - a.y) - dy * (d.x - a.x)) / length
  if (distanceC > LINE_TOLERANCE || distanceD > LINE_TOLERANCE) return 0
  const ux = dx / length, uy = dy / length
  const cProjection = (c.x - a.x) * ux + (c.y - a.y) * uy
  const dProjection = (d.x - a.x) * ux + (d.y - a.y) * uy
  const overlap = Math.min(length, Math.max(cProjection, dProjection))
    - Math.max(0, Math.min(cProjection, dProjection))
  return overlap > LINE_TOLERANCE ? overlap : 0
}

function clean(value: number): number {
  const rounded = Math.round(value * 1e9) / 1e9
  return Object.is(rounded, -0) ? 0 : rounded
}

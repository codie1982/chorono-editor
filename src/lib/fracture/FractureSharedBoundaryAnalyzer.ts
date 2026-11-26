import type { FracturePoint2D, FractureRegionRingGeometry } from '@/lib/types/fracture'

const LINE_TOLERANCE = 1e-7

export interface FractureSharedBoundaryMetrics {
  readonly lengthPx: number
  readonly midpointPx: FracturePoint2D
  /** Unit normal pointing from the left fragment toward the right fragment. */
  readonly normalFromLeftToRight: FracturePoint2D
}

/**
 * Measures the common non-zero boundary of two fracture regions.
 *
 * Rings use source-local composition pixels. Collinear partial overlaps are
 * accumulated even when one side subdivides an edge differently; point-only
 * contact is ignored. The representative midpoint and normal are weighted by
 * overlap length. A centroid direction fallback handles symmetric interfaces
 * whose individual edge normals cancel. Instances retain no mutable state.
 */
export class FractureSharedBoundaryAnalyzer {
  analyze(
    leftRings: readonly FractureRegionRingGeometry[],
    rightRings: readonly FractureRegionRingGeometry[],
    leftCentroid: FracturePoint2D,
    rightCentroid: FracturePoint2D,
  ): FractureSharedBoundaryMetrics | null {
    let lengthPx = 0
    let midpointX = 0
    let midpointY = 0
    let normalX = 0
    let normalY = 0
    const centroidDelta = {
      x: rightCentroid.x - leftCentroid.x,
      y: rightCentroid.y - leftCentroid.y,
    }
    const rightSegments = segments(rightRings)
    segments(leftRings).forEach(([start, end]) => {
      rightSegments.forEach(([otherStart, otherEnd]) => {
        const overlap = collinearOverlap(start, end, otherStart, otherEnd)
        if (!overlap) return
        const tangentX = (end.x - start.x) / overlap.edgeLengthPx
        const tangentY = (end.y - start.y) / overlap.edgeLengthPx
        const candidate = orientNormal({ x: -tangentY, y: tangentX }, centroidDelta)
        lengthPx += overlap.lengthPx
        midpointX += overlap.midpointPx.x * overlap.lengthPx
        midpointY += overlap.midpointPx.y * overlap.lengthPx
        normalX += candidate.x * overlap.lengthPx
        normalY += candidate.y * overlap.lengthPx
      })
    })
    if (lengthPx <= LINE_TOLERANCE) return null
    const normal = normalize({ x: normalX, y: normalY }) ?? normalize(centroidDelta)
    if (!normal) throw new Error('Adjacent fracture fragments have coincident centroids')
    return Object.freeze({
      lengthPx: clean(lengthPx),
      midpointPx: Object.freeze({ x: clean(midpointX / lengthPx), y: clean(midpointY / lengthPx) }),
      normalFromLeftToRight: Object.freeze({ x: clean(normal.x), y: clean(normal.y) }),
    })
  }
}

function segments(rings: readonly FractureRegionRingGeometry[]): [FracturePoint2D, FracturePoint2D][] {
  return rings.flatMap(ring => ring.points.map((point, index) => (
    [point, ring.points[(index + 1) % ring.points.length]] as [FracturePoint2D, FracturePoint2D]
  )))
}

function collinearOverlap(
  a: FracturePoint2D,
  b: FracturePoint2D,
  c: FracturePoint2D,
  d: FracturePoint2D,
): { lengthPx: number; edgeLengthPx: number; midpointPx: FracturePoint2D } | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const edgeLengthPx = Math.hypot(dx, dy)
  if (edgeLengthPx <= LINE_TOLERANCE) return null
  const distanceC = Math.abs(dx * (c.y - a.y) - dy * (c.x - a.x)) / edgeLengthPx
  const distanceD = Math.abs(dx * (d.y - a.y) - dy * (d.x - a.x)) / edgeLengthPx
  if (distanceC > LINE_TOLERANCE || distanceD > LINE_TOLERANCE) return null
  const unitX = dx / edgeLengthPx
  const unitY = dy / edgeLengthPx
  const cProjection = (c.x - a.x) * unitX + (c.y - a.y) * unitY
  const dProjection = (d.x - a.x) * unitX + (d.y - a.y) * unitY
  const startProjection = Math.max(0, Math.min(cProjection, dProjection))
  const endProjection = Math.min(edgeLengthPx, Math.max(cProjection, dProjection))
  const lengthPx = endProjection - startProjection
  if (lengthPx <= LINE_TOLERANCE) return null
  const midpointProjection = (startProjection + endProjection) / 2
  return {
    lengthPx,
    edgeLengthPx,
    midpointPx: { x: a.x + unitX * midpointProjection, y: a.y + unitY * midpointProjection },
  }
}

function orientNormal(normal: FracturePoint2D, direction: FracturePoint2D): FracturePoint2D {
  return normal.x * direction.x + normal.y * direction.y >= 0
    ? normal
    : { x: -normal.x, y: -normal.y }
}

function normalize(value: FracturePoint2D): FracturePoint2D | null {
  const length = Math.hypot(value.x, value.y)
  return length <= LINE_TOLERANCE ? null : { x: value.x / length, y: value.y / length }
}

function clean(value: number): number {
  const rounded = Math.round(value * 1e9) / 1e9
  return Object.is(rounded, -0) ? 0 : rounded
}

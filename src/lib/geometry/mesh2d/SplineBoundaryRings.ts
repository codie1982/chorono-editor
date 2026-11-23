import { sampleContourEdges } from '@/lib/spline/modeling/sampleContour'
import type { SplinePathData } from '@/lib/types/spline'
import { splineContourInterpolation, splineInterpolationTolerance } from '@/lib/spline/sampling/interpolation'

const GEOMETRY_EPSILON = 1e-8

export interface SplineBoundaryPoint {
  readonly x: number
  readonly y: number
  /** Index in the flattened contour before redundant collinear points are removed. */
  readonly sampleIndex: number
}

export interface SplineBoundaryRing {
  readonly contourId: string
  readonly points: readonly SplineBoundaryPoint[]
  /** Twice the signed local-pixel area in Chorono's x-right/y-down space. */
  readonly signedDoubleArea: number
  readonly parentIndex: number | null
  readonly depth: number
  readonly role: 'outer' | 'hole'
}

interface WorkingRing {
  contourId: string
  points: SplineBoundaryPoint[]
  signedDoubleArea: number
  parentIndex: number | null
  depth: number
  role: 'outer' | 'hole'
  insideWinding: number
}

/**
 * Flattens and validates the closed contours used by spline-boundary Mesh2D.
 *
 * Instances are stateless. Output coordinates remain in spline-local pixels;
 * the caller supplies a local-space maximum flatten deviation. An authored
 * Object interpolation preference may request finer sampling; omitted settings
 * preserve legacy defaults. Authored requests use strict bounded subdivision.
 * The builder
 * rejects open, degenerate, self-intersecting, touching and crossing rings
 * before triangulation. Even-odd nesting alternates outer/hole roles. Nonzero
 * nesting must change fill state at every boundary; redundant same-winding
 * nested contours are rejected instead of being silently discarded.
 */
export class SplineBoundaryRingBuilder {
  static readonly maxContourCount = 128
  static readonly maxVertexCount = 262_144

  build(data: SplinePathData, flattenTolerance: number): readonly SplineBoundaryRing[] {
    if (!Number.isFinite(flattenTolerance) || flattenTolerance <= 0) {
      throw new Error('Spline flatten tolerance must be a finite positive number')
    }
    const contourIds = this.orderedContourIds(data)
    if (contourIds.length === 0) throw new Error('Spline has no contours to triangulate')
    if (contourIds.length > SplineBoundaryRingBuilder.maxContourCount) {
      throw new Error(`Spline exceeds the ${SplineBoundaryRingBuilder.maxContourCount} contour limit`)
    }

    const rings = contourIds.map(contourId => this.flattenRing(data, contourId, flattenTolerance))
    const vertexCount = rings.reduce((sum, ring) => sum + ring.points.length, 0)
    if (vertexCount > SplineBoundaryRingBuilder.maxVertexCount) {
      throw new Error(`Spline boundary exceeds the ${SplineBoundaryRingBuilder.maxVertexCount.toLocaleString('en-US')} vertex budget`)
    }

    rings.forEach(ring => this.validateSelfIntersection(ring))
    this.validateRingIntersections(rings)
    this.assignContainment(rings)
    this.assignFillRoles(rings, data.fillRule)
    return rings
  }

  private orderedContourIds(data: SplinePathData): string[] {
    const ids: string[] = []
    const seen = new Set<string>()
    const subShapes = Object.values(data.subShapes).sort((a, b) => a.id.localeCompare(b.id))
    for (const subShape of subShapes) {
      if (!['add', 'none'].includes(subShape.combineMode)) {
        throw new Error(`Spline combine mode "${subShape.combineMode}" is not supported by Mesh2D boundary triangulation`)
      }
      for (const contourId of subShape.contourIds) {
        if (seen.has(contourId)) throw new Error(`Spline contour "${contourId}" is referenced more than once`)
        if (!data.contours[contourId]) throw new Error(`Spline sub-shape references missing contour "${contourId}"`)
        seen.add(contourId)
        ids.push(contourId)
      }
    }
    const unreferenced = Object.keys(data.contours).filter(id => !seen.has(id))
    if (unreferenced.length > 0) throw new Error(`Spline contains unreferenced contour "${unreferenced.sort()[0]}"`)
    return ids
  }

  private flattenRing(data: SplinePathData, contourId: string, flattenTolerance: number): WorkingRing {
    const sampled = sampleContourEdges(data, contourId, { flatness: splineInterpolationTolerance(data, contourId, flattenTolerance), requireTolerance: !!splineContourInterpolation(data, contourId) })
    if (!sampled.contour.closed) throw new Error(`Spline contour "${contourId}" must be closed before triangulation`)
    const raw = sampled.edges.flatMap(edge => edge.points.slice(0, -1))
      .map((point, sampleIndex) => ({ ...point, sampleIndex }))
    const points = this.removeRedundantPoints(raw, contourId)
    if (points.length < 3) throw new Error(`Spline contour "${contourId}" needs at least three distinct boundary points`)
    const signedDoubleArea = polygonSignedDoubleArea(points)
    if (!Number.isFinite(signedDoubleArea) || Math.abs(signedDoubleArea) <= GEOMETRY_EPSILON) {
      throw new Error(`Spline contour "${contourId}" has zero or near-zero area`)
    }
    return { contourId, points, signedDoubleArea, parentIndex: null, depth: 0, role: 'outer', insideWinding: 0 }
  }

  private removeRedundantPoints(points: readonly SplineBoundaryPoint[], contourId: string): SplineBoundaryPoint[] {
    const distinct: SplineBoundaryPoint[] = []
    for (const point of points) {
      const previous = distinct.at(-1)
      if (!previous || squaredDistance(previous, point) > GEOMETRY_EPSILON ** 2) distinct.push(point)
    }
    if (distinct.length > 1 && squaredDistance(distinct[0], distinct.at(-1)!) <= GEOMETRY_EPSILON ** 2) distinct.pop()

    for (let index = 0; index < distinct.length; index++) {
      const a = distinct[(index - 1 + distinct.length) % distinct.length]
      const b = distinct[index]
      const c = distinct[(index + 1) % distinct.length]
      const turn = cross(a, b, c)
      const direction = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)
      if (Math.abs(turn) <= GEOMETRY_EPSILON && direction < -GEOMETRY_EPSILON) {
        throw new Error(`Spline contour "${contourId}" backtracks along its boundary`)
      }
    }

    let changed = true
    while (changed && distinct.length > 3) {
      changed = false
      for (let index = 0; index < distinct.length; index++) {
        const a = distinct[(index - 1 + distinct.length) % distinct.length]
        const b = distinct[index]
        const c = distinct[(index + 1) % distinct.length]
        const between = (b.x - a.x) * (b.x - c.x) + (b.y - a.y) * (b.y - c.y) <= GEOMETRY_EPSILON
        if (Math.abs(cross(a, b, c)) <= GEOMETRY_EPSILON && between) {
          distinct.splice(index, 1)
          changed = true
          break
        }
      }
    }
    return distinct
  }

  private validateSelfIntersection(ring: WorkingRing): void {
    const count = ring.points.length
    for (let first = 0; first < count; first++) {
      const a = ring.points[first], b = ring.points[(first + 1) % count]
      for (let second = first + 1; second < count; second++) {
        if (second === first + 1 || (first === 0 && second === count - 1)) continue
        const c = ring.points[second], d = ring.points[(second + 1) % count]
        if (segmentsIntersect(a, b, c, d)) {
          throw new Error(`Spline contour "${ring.contourId}" self-intersects`)
        }
      }
    }
  }

  private validateRingIntersections(rings: readonly WorkingRing[]): void {
    for (let first = 0; first < rings.length; first++) {
      for (let second = first + 1; second < rings.length; second++) {
        for (let aIndex = 0; aIndex < rings[first].points.length; aIndex++) {
          const a = rings[first].points[aIndex]
          const b = rings[first].points[(aIndex + 1) % rings[first].points.length]
          for (let cIndex = 0; cIndex < rings[second].points.length; cIndex++) {
            const c = rings[second].points[cIndex]
            const d = rings[second].points[(cIndex + 1) % rings[second].points.length]
            if (segmentsIntersect(a, b, c, d)) {
              throw new Error(`Spline contours "${rings[first].contourId}" and "${rings[second].contourId}" intersect or touch`)
            }
          }
        }
      }
    }
  }

  private assignContainment(rings: WorkingRing[]): void {
    rings.forEach((ring, ringIndex) => {
      let parentIndex: number | null = null
      let parentArea = Infinity
      rings.forEach((candidate, candidateIndex) => {
        if (candidateIndex === ringIndex || Math.abs(candidate.signedDoubleArea) <= Math.abs(ring.signedDoubleArea)) return
        if (pointInPolygon(ring.points[0], candidate.points) && Math.abs(candidate.signedDoubleArea) < parentArea) {
          parentIndex = candidateIndex
          parentArea = Math.abs(candidate.signedDoubleArea)
        }
      })
      ring.parentIndex = parentIndex
    })
    const depthOf = (index: number): number => {
      const parent = rings[index].parentIndex
      return parent === null ? 0 : depthOf(parent) + 1
    }
    rings.forEach((ring, index) => { ring.depth = depthOf(index) })
  }

  private assignFillRoles(rings: WorkingRing[], fillRule: SplinePathData['fillRule']): void {
    if (fillRule === 'evenodd') {
      rings.forEach(ring => { ring.role = ring.depth % 2 === 0 ? 'outer' : 'hole' })
      return
    }
    const ordered = rings.map((_, index) => index).sort((a, b) => rings[a].depth - rings[b].depth)
    for (const index of ordered) {
      const ring = rings[index]
      const outsideWinding = ring.parentIndex === null ? 0 : rings[ring.parentIndex].insideWinding
      ring.insideWinding = outsideWinding + Math.sign(ring.signedDoubleArea)
      const outsideFilled = outsideWinding !== 0
      const insideFilled = ring.insideWinding !== 0
      if (outsideFilled === insideFilled) {
        throw new Error(`Nonzero contour "${ring.contourId}" does not change fill state; reverse or remove the nested contour`)
      }
      ring.role = insideFilled ? 'outer' : 'hole'
    }
  }
}

function polygonSignedDoubleArea(points: readonly SplineBoundaryPoint[]): number {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index], next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return area
}

function pointInPolygon(point: SplineBoundaryPoint, ring: readonly SplineBoundaryPoint[]): boolean {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current], b = ring[previous]
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function segmentsIntersect(a: SplineBoundaryPoint, b: SplineBoundaryPoint, c: SplineBoundaryPoint, d: SplineBoundaryPoint): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d)
  const cdA = cross(c, d, a), cdB = cross(c, d, b)
  if (((abC > GEOMETRY_EPSILON && abD < -GEOMETRY_EPSILON) || (abC < -GEOMETRY_EPSILON && abD > GEOMETRY_EPSILON))
    && ((cdA > GEOMETRY_EPSILON && cdB < -GEOMETRY_EPSILON) || (cdA < -GEOMETRY_EPSILON && cdB > GEOMETRY_EPSILON))) return true
  return (Math.abs(abC) <= GEOMETRY_EPSILON && onSegment(a, b, c))
    || (Math.abs(abD) <= GEOMETRY_EPSILON && onSegment(a, b, d))
    || (Math.abs(cdA) <= GEOMETRY_EPSILON && onSegment(c, d, a))
    || (Math.abs(cdB) <= GEOMETRY_EPSILON && onSegment(c, d, b))
}

function onSegment(a: SplineBoundaryPoint, b: SplineBoundaryPoint, point: SplineBoundaryPoint): boolean {
  return point.x >= Math.min(a.x, b.x) - GEOMETRY_EPSILON
    && point.x <= Math.max(a.x, b.x) + GEOMETRY_EPSILON
    && point.y >= Math.min(a.y, b.y) - GEOMETRY_EPSILON
    && point.y <= Math.max(a.y, b.y) + GEOMETRY_EPSILON
}

function cross(a: SplineBoundaryPoint, b: SplineBoundaryPoint, c: SplineBoundaryPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function squaredDistance(a: SplineBoundaryPoint, b: SplineBoundaryPoint): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}

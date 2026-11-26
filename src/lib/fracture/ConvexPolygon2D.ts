import type { FractureBounds2D, FracturePoint2D } from '@/lib/types/fracture'

const EPSILON = 1e-9

/**
 * Immutable validated convex polygon calculations for fracture generation.
 *
 * Input and output use source-layer local pixels with +Y down. Construction
 * removes a repeated closing vertex and collinear points, rejects duplicate or
 * concave topology, and normalizes winding to positive shoelace area. Instances
 * hold only a frozen normalized point list and derived scalar values.
 */
export class ConvexPolygon2D {
  readonly points: readonly FracturePoint2D[]
  readonly area: number
  readonly centroid: FracturePoint2D
  readonly bounds: FractureBounds2D

  constructor(input: readonly FracturePoint2D[], label = 'Fracture polygon') {
    const points = normalizePolygon(input, label)
    const twiceArea = signedDoubleArea(points)
    if (Math.abs(twiceArea) <= EPSILON) throw new RangeError(`${label} has zero area`)
    const oriented = twiceArea > 0 ? points : points.slice().reverse()
    assertConvex(oriented, label)
    this.points = Object.freeze(oriented.map(point => Object.freeze({ ...point })))
    this.area = signedDoubleArea(this.points) / 2
    this.centroid = Object.freeze(polygonCentroid(this.points, this.area))
    this.bounds = Object.freeze(polygonBounds(this.points))
  }

  /** Returns true for interior or boundary points within the supplied tolerance. */
  contains(point: FracturePoint2D, tolerance = EPSILON): boolean {
    return this.points.every((current, index) => (
      cross(current, this.points[(index + 1) % this.points.length], point) >= -tolerance
    ))
  }
}

/** Clips a convex subject polygon to a validated convex clip polygon. */
export function clipConvexPolygon(
  subject: readonly FracturePoint2D[],
  clip: ConvexPolygon2D,
): FracturePoint2D[] {
  let output = subject.map(point => ({ ...point }))
  for (let edge = 0; edge < clip.points.length && output.length; edge++) {
    const edgeStart = clip.points[edge]
    const edgeEnd = clip.points[(edge + 1) % clip.points.length]
    const input = output
    output = []
    for (let index = 0; index < input.length; index++) {
      const start = input[index]
      const end = input[(index + 1) % input.length]
      const startInside = cross(edgeStart, edgeEnd, start) >= -EPSILON
      const endInside = cross(edgeStart, edgeEnd, end) >= -EPSILON
      if (startInside && endInside) output.push(end)
      else if (startInside && !endInside) output.push(intersection(start, end, edgeStart, edgeEnd))
      else if (!startInside && endInside) {
        output.push(intersection(start, end, edgeStart, edgeEnd), end)
      }
    }
  }
  return normalizeLoose(output)
}

/** Computes positive or negative twice-area without mutating the polygon. */
export function signedDoubleArea(points: readonly FracturePoint2D[]): number {
  let sum = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index], next = points[(index + 1) % points.length]
    sum += current.x * next.y - next.x * current.y
  }
  return sum
}

function normalizePolygon(input: readonly FracturePoint2D[], label: string): FracturePoint2D[] {
  if (!Array.isArray(input) || input.length < 3) throw new RangeError(`${label} needs at least three vertices`)
  const points = input.map((point, index) => {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError(`${label} vertex ${index} must be finite`)
    }
    return { x: clean(point.x), y: clean(point.y) }
  })
  if (samePoint(points[0], points[points.length - 1])) points.pop()
  if (points.length < 3) throw new RangeError(`${label} needs three distinct vertices`)
  for (let index = 0; index < points.length; index++) {
    if (samePoint(points[index], points[(index + 1) % points.length])) {
      throw new Error(`${label} contains duplicate consecutive vertices`)
    }
  }
  const normalized = normalizeLoose(points)
  if (normalized.length < 3) throw new RangeError(`${label} collapses after collinear vertices are removed`)
  return normalized
}

function normalizeLoose(input: readonly FracturePoint2D[]): FracturePoint2D[] {
  const points = input.map(point => ({ x: clean(point.x), y: clean(point.y) }))
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) points.pop()
  let changed = true
  while (changed && points.length >= 3) {
    changed = false
    for (let index = 0; index < points.length; index++) {
      const previous = points[(index + points.length - 1) % points.length]
      const current = points[index]
      const next = points[(index + 1) % points.length]
      if (samePoint(previous, current) || Math.abs(cross(previous, current, next)) <= EPSILON) {
        points.splice(index, 1)
        changed = true
        break
      }
    }
  }
  return points
}

function assertConvex(points: readonly FracturePoint2D[], label: string): void {
  for (let index = 0; index < points.length; index++) {
    if (cross(points[index], points[(index + 1) % points.length], points[(index + 2) % points.length]) <= EPSILON) {
      throw new Error(`${label} must be strictly convex`)
    }
  }
}

function polygonCentroid(points: readonly FracturePoint2D[], area: number): FracturePoint2D {
  let x = 0, y = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index], next = points[(index + 1) % points.length]
    const weight = current.x * next.y - next.x * current.y
    x += (current.x + next.x) * weight
    y += (current.y + next.y) * weight
  }
  const divisor = 6 * area
  return { x: clean(x / divisor), y: clean(y / divisor) }
}

function polygonBounds(points: readonly FracturePoint2D[]): FractureBounds2D {
  return points.reduce<FractureBounds2D>((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x), minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x), maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
}

function intersection(
  segmentStart: FracturePoint2D,
  segmentEnd: FracturePoint2D,
  edgeStart: FracturePoint2D,
  edgeEnd: FracturePoint2D,
): FracturePoint2D {
  const segmentX = segmentEnd.x - segmentStart.x, segmentY = segmentEnd.y - segmentStart.y
  const edgeX = edgeEnd.x - edgeStart.x, edgeY = edgeEnd.y - edgeStart.y
  const denominator = segmentX * edgeY - segmentY * edgeX
  if (Math.abs(denominator) <= EPSILON) return { ...segmentEnd }
  const offsetX = edgeStart.x - segmentStart.x, offsetY = edgeStart.y - segmentStart.y
  const t = (offsetX * edgeY - offsetY * edgeX) / denominator
  return { x: clean(segmentStart.x + t * segmentX), y: clean(segmentStart.y + t * segmentY) }
}

function cross(start: FracturePoint2D, end: FracturePoint2D, point: FracturePoint2D): number {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
}

function samePoint(left: FracturePoint2D, right: FracturePoint2D): boolean {
  return Math.abs(left.x - right.x) <= EPSILON && Math.abs(left.y - right.y) <= EPSILON
}

function clean(value: number): number {
  const rounded = Math.round(value * 1e9) / 1e9
  return Object.is(rounded, -0) ? 0 : rounded
}

import type { SplinePathData } from '@/lib/types/spline'
import { buildSplineData } from '../util/buildSplineData'
import { sampleContourEdges, type Vec2 } from './sampleContour'

export type OffsetDirection = 'outward' | 'inward' | 'left' | 'right'
export interface OffsetOptions { contourId: string; distance: number; direction: OffsetDirection; mode: 'offset' | 'outline' }
const EPS = 1e-7
const MITER_LIMIT = 4

/**
 * Create a detached, editable offset or outline in layer-local pixels. Curved
 * source segments are flattened to <=0.25 local-pixel chord error before the
 * parallel polyline is constructed. Closed offsets use contour winding for
 * outward/inward; open offsets use left/right. Outline creates an even-odd
 * band (closed inputs) or a capped band (open inputs). Degenerate, overlapping,
 * self-intersecting and collapsed results are rejected rather than saved.
 */
export function createOffsetOutline(data: SplinePathData, options: OffsetOptions): SplinePathData {
  const { contour, edges } = sampleContourEdges(data, options.contourId)
  const distance = options.distance
  if (!Number.isFinite(distance) || distance <= 0 || distance > 10000) throw new Error('Offset distance must be between 0 and 10000 local pixels.')
  if (!['outward', 'inward', 'left', 'right'].includes(options.direction)) throw new Error('Unknown offset direction.')
  const source = edges.flatMap((edge, index) => index ? edge.points.slice(1) : edge.points)
  if (contour.closed) source.pop()
  if (source.length < (contour.closed ? 3 : 2) || source.length > 4096 || intersectsSelf(source, contour.closed)) throw new Error('Offset requires a simple contour with at most 4096 sampled points.')
  const area = signedArea(source)
  if (contour.closed && Math.abs(area) <= EPS) throw new Error('Closed contour has zero area.')
  if (contour.closed && (options.direction === 'left' || options.direction === 'right')) throw new Error('Use outward or inward for a closed contour.')
  if (!contour.closed && (options.direction === 'outward' || options.direction === 'inward')) throw new Error('Use left or right for an open contour.')
  const outwardSign = Math.sign(area)
  const directionSign = contour.closed
    ? outwardSign * (options.direction === 'outward' ? 1 : -1)
    : options.direction === 'right' ? 1 : -1
  const primary = offsetPolyline(source, distance * directionSign, contour.closed)
  validateOffset(source, primary, contour.closed)
  const outlines: Vec2[][] = [primary]
  if (options.mode === 'outline') {
    const secondary = offsetPolyline(source, -distance * directionSign, contour.closed)
    validateOffset(source, secondary, contour.closed)
    if (contour.closed) outlines.push(secondary)
    else {
      const band = [...primary, ...secondary.reverse()]
      if (intersectsSelf(band, true)) throw new Error('Outline self-intersects at this distance.')
      outlines[0] = band
    }
  }
  const result = buildSplineData({
    kind: 'custom', name: options.mode === 'outline' ? 'Outline' : 'Offset', source: 'edited',
    fillRule: options.mode === 'outline' ? 'evenodd' : data.fillRule,
    contours: outlines.map(points => ({ closed: contour.closed || options.mode === 'outline', anchors: points.map(point => ({ ...point, type: 'corner' as const })) })),
  })
  for (const sub of Object.values(result.subShapes)) sub.editable = true
  return result
}

/** Positive distance offsets to the right of each directed edge. */
function offsetPolyline(points: Vec2[], distance: number, closed: boolean): Vec2[] {
  const edgeCount = closed ? points.length : points.length - 1
  const normals: Vec2[] = []
  for (let i = 0; i < edgeCount; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy)
    if (length <= EPS) throw new Error('Offset source contains a zero-length edge.')
    normals.push({ x: dy / length, y: -dx / length })
  }
  const result: Vec2[] = []
  for (let i = 0; i < points.length; i++) {
    const prev = i ? i - 1 : edgeCount - 1
    const next = i === edgeCount ? edgeCount - 1 : i
    if (!closed && (i === 0 || i === points.length - 1)) {
      const normal = normals[i === 0 ? 0 : edgeCount - 1]
      result.push({ x: points[i].x + normal.x * distance, y: points[i].y + normal.y * distance })
      continue
    }
    const a = normals[prev], b = normals[next]
    const dot = a.x * b.x + a.y * b.y
    if (dot < -0.999) throw new Error('A 180-degree turn cannot be offset.')
    const denominator = 1 + dot
    const miter = { x: (a.x + b.x) * distance / denominator, y: (a.y + b.y) * distance / denominator }
    if (Math.hypot(miter.x, miter.y) <= Math.abs(distance) * MITER_LIMIT) result.push({ x: points[i].x + miter.x, y: points[i].y + miter.y })
    else {
      result.push({ x: points[i].x + a.x * distance, y: points[i].y + a.y * distance })
      result.push({ x: points[i].x + b.x * distance, y: points[i].y + b.y * distance })
    }
  }
  return result
}

function signedArea(points: Vec2[]): number {
  return points.reduce((sum, point, i) => {
    const next = points[(i + 1) % points.length]
    return sum + point.x * next.y - point.y * next.x
  }, 0) / 2
}

function validateOffset(source: Vec2[], result: Vec2[], closed: boolean): void {
  if (result.length > 8192 || intersectsSelf(result, closed)) throw new Error('Offset self-intersects at this distance.')
  if (closed && Math.sign(signedArea(result)) !== Math.sign(signedArea(source))) throw new Error('Offset collapses or reverses the contour.')
}

function intersectsSelf(points: Vec2[], closed: boolean): boolean {
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) for (let j = i + 2; j < count; j++) {
    if (closed && i === 0 && j === count - 1) continue
    if (segmentsCross(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) return true
  }
  return false
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (u: Vec2, v: Vec2, w: Vec2) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x)
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
  if ((abC > EPS && abD > EPS) || (abC < -EPS && abD < -EPS) ||
      (cdA > EPS && cdB > EPS) || (cdA < -EPS && cdB < -EPS)) return false
  return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + EPS &&
    Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) + EPS
}

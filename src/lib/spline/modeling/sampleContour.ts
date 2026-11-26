import type { SplineContour, SplinePathData, SplineSegment } from '@/lib/types/spline'

export interface Vec2 { x: number; y: number }
export interface SampledEdge { points: Vec2[]; length: number }

export interface SampleContourOptions {
  /** Maximum local-pixel chord deviation before the recursion depth limit. */
  readonly flatness?: number
  /** Hard output guard shared by all edges in this contour. */
  readonly maxSamples?: number
}

const MAX_SAMPLES = 8192
const FLATNESS = 0.25
const EPS = 1e-7

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * Approximate one normalized spline contour with layer-local polylines. The
 * maximum chord deviation defaults to 0.25 local pixels until the depth limit
 * (12). Callers may provide a fixed local-space tolerance; viewport zoom must
 * never be used as that value.
 * Reject missing/non-finite topology and unbounded output. The returned arrays
 * are detached; callers may slice them without changing source records.
 */
export function sampleContourEdges(
  data: SplinePathData,
  contourId: string,
  options: SampleContourOptions = {},
): { contour: SplineContour; edges: SampledEdge[] } {
  const flatnessTolerance = options.flatness ?? FLATNESS
  const maxSamples = options.maxSamples ?? MAX_SAMPLES
  if (!Number.isFinite(flatnessTolerance) || flatnessTolerance <= 0) {
    throw new Error('Spline flatten tolerance must be a finite positive number.')
  }
  if (!Number.isSafeInteger(maxSamples) || maxSamples < 2) {
    throw new Error('Spline sample budget must be a safe integer of at least two.')
  }
  const contour = data.contours[contourId]
  if (!contour || contour.pointIds.length < 2 || contour.segmentIds.length !== contour.pointIds.length - (contour.closed ? 0 : 1)) {
    throw new Error('Choose a valid spline contour with at least two points.')
  }
  const handles = new Map(Object.values(data.handles).map(handle => [`${handle.pointId}:${handle.kind}`, handle]))
  let sampleCount = 0
  const edges = contour.segmentIds.map((id, index) => {
    const segment = data.segments[id]
    const from = data.points[contour.pointIds[index]]
    const to = data.points[contour.pointIds[(index + 1) % contour.pointIds.length]]
    if (!segment || !from || !to || segment.fromPointId !== from.id || segment.toPointId !== to.id) throw new Error('Spline contour topology is inconsistent.')
    const controls = controlPoints(segment, from, to, handles)
    const points: Vec2[] = [{ x: from.x, y: from.y }]
    if (controls.length === 2) {
      subdivideQuadratic(points, from, controls[0], to, 0, flatnessTolerance)
    } else if (controls.length === 3) {
      subdivideCubic(points, from, controls[0], controls[1], to, 0, flatnessTolerance)
    } else points.push({ x: to.x, y: to.y })
    sampleCount += points.length
    if (sampleCount > maxSamples || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error('Spline contour is too complex or contains non-finite geometry.')
    const length = points.slice(1).reduce((sum, point, i) => sum + distance(points[i], point), 0)
    if (length <= EPS) throw new Error('Zero-length spline edges cannot be modeled.')
    return { points, length }
  })
  return { contour, edges }
}

/** Returns interior controls for a line, quadratic or cubic segment. */
function controlPoints(segment: SplineSegment, from: Vec2 & { id: string }, to: Vec2 & { id: string }, handles: Map<string, Vec2>): Vec2[] {
  if (segment.type === 'quadratic') return [segment.control1 ?? from, to]
  if (segment.type === 'cubic') return [handles.get(`${from.id}:out`) ?? from, handles.get(`${to.id}:in`) ?? to, to]
  return []
}

function flatness(point: Vec2, start: Vec2, end: Vec2): number {
  const length = distance(start, end)
  return length < EPS ? distance(point, start) : Math.abs((end.x - start.x) * (start.y - point.y) - (start.x - point.x) * (end.y - start.y)) / length
}

function subdivideQuadratic(out: Vec2[], a: Vec2, b: Vec2, c: Vec2, depth: number, tolerance: number): void {
  if (depth >= 12 || flatness(b, a, c) <= tolerance) { out.push({ x: c.x, y: c.y }); return }
  const ab = midpoint(a, b), bc = midpoint(b, c), mid = midpoint(ab, bc)
  subdivideQuadratic(out, a, ab, mid, depth + 1, tolerance)
  subdivideQuadratic(out, mid, bc, c, depth + 1, tolerance)
}

function subdivideCubic(out: Vec2[], a: Vec2, b: Vec2, c: Vec2, d: Vec2, depth: number, tolerance: number): void {
  if (depth >= 12 || Math.max(flatness(b, a, d), flatness(c, a, d)) <= tolerance) { out.push({ x: d.x, y: d.y }); return }
  const ab = midpoint(a, b), bc = midpoint(b, c), cd = midpoint(c, d)
  const abc = midpoint(ab, bc), bcd = midpoint(bc, cd), mid = midpoint(abc, bcd)
  subdivideCubic(out, a, ab, abc, mid, depth + 1, tolerance)
  subdivideCubic(out, mid, bcd, cd, d, depth + 1, tolerance)
}

/** Slice an edge by arc distance, preserving sampled intermediate points. */
export function sliceSampledEdge(edge: SampledEdge, start: number, end: number): Vec2[] {
  if (start < 0 || end > edge.length + EPS || end - start <= EPS) throw new Error('Corner cuts overlap on a spline edge.')
  const positions = [0]
  for (let i = 1; i < edge.points.length; i++) positions.push(positions[i - 1] + distance(edge.points[i - 1], edge.points[i]))
  const at = (target: number): Vec2 => {
    for (let i = 1; i < positions.length; i++) if (target <= positions[i] + EPS) {
      const span = positions[i] - positions[i - 1]
      const t = span <= EPS ? 0 : Math.max(0, Math.min(1, (target - positions[i - 1]) / span))
      return { x: edge.points[i - 1].x + (edge.points[i].x - edge.points[i - 1].x) * t,
        y: edge.points[i - 1].y + (edge.points[i].y - edge.points[i - 1].y) * t }
    }
    return edge.points.at(-1)!
  }
  return [at(start), ...edge.points.slice(1, -1).filter((_, i) => positions[i + 1] > start + EPS && positions[i + 1] < end - EPS), at(end)]
}

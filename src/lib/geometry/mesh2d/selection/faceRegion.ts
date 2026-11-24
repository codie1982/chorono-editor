import type { SelectionRegion } from '../../../selection/selectionGesture'
import { regionContains, regionPolygon } from '../../../selection/regionGeometry'
import { pointInPolygon, segmentsIntersect } from '../../../selection/canvasShapes'
import { distToSegmentSq } from '../../segmentDistance'
type Point = { x: number; y: number }

/** Closed logical-face membership in one world coordinate system; includes
 * boundaries at a 1e-12 px² distance tolerance and supports concave quads. */
export function meshFaceContains(points: Point[], point: Point): boolean {
  return pointInPolygon(point, points) || points.some((a, i) => {
    const b = points[(i + 1) % points.length]
    return distToSegmentSq(point.x, point.y, a.x, a.y, b.x, b.y).dSq <= 1e-12
  })
}

/** Logical polygon region selection. Crossing includes a brush/region entirely
 * inside a face, not just touched face vertices. Circle Inside requires every
 * corner; paint always uses crossing. Polygon Inside also checks edge intervals
 * so a concave lasso notch cannot silently cross an included face. */
export function meshFaceInRegion(points: Point[], region: SelectionRegion, containment: 'inside' | 'touching'): boolean {
  if (containment === 'inside' && region.kind !== 'paint') {
    if (!points.every(p => region.kind === 'lasso' ? meshFaceContains(region.points, p) : regionContains(region, p))) return false
    if (region.kind !== 'lasso') return true
    return points.every((a, i) => edgeInsidePolygon(a, points[(i + 1) % points.length], region.points))
  }
  if (points.some(p => regionContains(region, p))) return true
  if (region.kind === 'circle' || region.kind === 'paint') {
    const center = { x: region.cx, y: region.cy }
    return meshFaceContains(points, center) || points.some((a, i) => {
      const b = points[(i + 1) % points.length]
      return distToSegmentSq(center.x, center.y, a.x, a.y, b.x, b.y).dSq <= region.r ** 2
    })
  }
  const polygon = regionPolygon(region)
  return polygon.some(p => meshFaceContains(points, p)) || points.some((a, i) => polygon.some((p, j) =>
    segmentsIntersect(a, points[(i + 1) % points.length], p, polygon[(j + 1) % polygon.length])))
}

/** Partition a segment at polygon boundary crossings and test each interval.
 * Collinear overlap is covered by boundary-inclusive membership; no sampling
 * resolution or source geometry approximation is introduced. */
function edgeInsidePolygon(a: Point, b: Point, polygon: Point[]): boolean {
  const dx = b.x - a.x, dy = b.y - a.y, cuts = [0, 1]
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length], ex = q.x - p.x, ey = q.y - p.y
    const denominator = dx * ey - dy * ex
    if (Math.abs(denominator) <= 1e-12) return
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / denominator
    const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / denominator
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t)
  })
  cuts.sort((x, y) => x - y)
  return cuts.slice(1).every((end, i) => meshFaceContains(polygon, { x: a.x + dx * (end + cuts[i]) / 2, y: a.y + dy * (end + cuts[i]) / 2 }))
}

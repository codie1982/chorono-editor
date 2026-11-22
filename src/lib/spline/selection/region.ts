import { regionContains as contains, regionPolygon as polygon } from '../../selection/regionGeometry'
import type { SplinePathData } from '../../types/spline'
import type { SelectionRegion } from '../../selection/selectionGesture'
import { pointInPolygon, segmentsIntersect } from '../../selection/canvasShapes'
import { PathSampler } from '../../path/PathSampler'
import { hitTestSplineFill, hitTestSplineSegment } from '../geometry/hitTest'
import { subShapeData, splineEdgePath } from './geometry'
import type { SplineEditMode } from './state'

/** Selection sampling reuses canonical curve conversion/PathSampler, at 32
 * subdivisions per curve (approximate, not Boolean topology). Boundaries of
 * separate contours never become a fabricated connecting segment. Inside
 * requires all samples; Touching tests crossings plus compound fill coverage.
 * Input is evaluated world spline data, not authored fallback geometry. */
export function splineIdsInRegion(data: SplinePathData, mode: SplineEditMode, region: SelectionRegion,
  containment: 'inside' | 'touching'): Set<string> {
  if (mode === 'point') return new Set(Object.values(data.points).filter(point => contains(region, point)).map(point => point.id))
  const sampler = new PathSampler(), boundary = polygon(region)
  const samples = new Map(Object.keys(data.segments).map(id => [id, sampler.buildLengthTable(splineEdgePath(data, id)).samples]))
  const edgeMatches = (id: string, inside: boolean): boolean => {
    const points = samples.get(id) ?? []
    if (!points.length) return false
    if (inside) return points.every(point => contains(region, point))
    if (points.some(point => contains(region, point))) return true
    if (region.kind === 'circle' || region.kind === 'paint') return !!hitTestSplineSegment({ ...data, segments: { [id]: data.segments[id] } }, region.cx, region.cy, region.r)
    return points.some((point, index) => index > 0 && boundary.some((b, j) => segmentsIntersect(points[index - 1], point, b, boundary[(j + 1) % boundary.length])))
  }
  const inside = containment === 'inside' && region.kind !== 'paint'
  if (mode === 'edge') return new Set(Object.keys(data.segments).filter(id => edgeMatches(id, inside)))
  const probe = region.kind === 'box' ? { x: region.x, y: region.y } : region.kind === 'lasso' ? region.points[0] : { x: region.cx, y: region.cy }
  return new Set(Object.values(data.subShapes).filter(object => {
    const contours = object.contourIds.map(id => data.contours[id]).filter(Boolean)
    const edges = Array.from(new Set(contours.flatMap(contour => contour.segmentIds)))
    const points = Array.from(new Set(contours.flatMap(contour => contour.pointIds))).map(id => data.points[id]).filter(Boolean)
    if (inside) return points.length > 0 && points.every(point => contains(region, point)) && edges.every(id => edgeMatches(id, true))
    return points.some(point => contains(region, point)) || edges.some(id => edgeMatches(id, false))
      || !!probe && hitTestSplineFill(subShapeData(data, object.id), probe.x, probe.y)
  }).map(object => object.id))
}

import type { SelectionRegion } from './selectionGesture'
import { pointInRect, pointInCircle, pointInPolygon } from './canvasShapes'
type Point = { x: number; y: number }
/** Region membership in the caller's single coordinate space; boundaries use
 * the existing selection predicates. No source/region mutation. */
export function regionContains(region: SelectionRegion, point: Point): boolean {
  if (region.kind === 'box') return pointInRect(point, region)
  if (region.kind === 'lasso') return pointInPolygon(point, region.points)
  return pointInCircle(point, { x: region.cx, y: region.cy, r: region.r })
}
/** Exact polygon boundary for box/lasso; circle/paint callers use distance. */
export function regionPolygon(region: SelectionRegion): readonly Point[] {
  if (region.kind === 'lasso') return region.points
  if (region.kind !== 'box') return []
  return [{ x: region.x, y: region.y }, { x: region.x + region.w, y: region.y },
    { x: region.x + region.w, y: region.y + region.h }, { x: region.x, y: region.y + region.h }]
}

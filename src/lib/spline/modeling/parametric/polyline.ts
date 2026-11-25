import type { SplinePathData } from '../../../types/spline'
import type { Vec2 } from '../../../geometry/CoordinateSystem'
import { sharpSplineCornerIds } from '../../corners'
import { assertSplineLocks, assertSplineTopology, markEditedSubShapes, retainSplineContours } from '../../topology'
import { createSplineIdAllocator } from '../../util/uid'
import { splineObjectSelection, validateSplineObjectEdit } from '../../edit/objectSelection'
import { SplineArcSampler, type SplineSamplingBudget } from './SplineArcSampler'

export interface PolylineVertex extends Vec2 { id?: string }
export interface ContourPolyline { contourId: string; vertices: PolylineVertex[] }

/** Equally spaced arc stops PER pinned span. Sharp geometric corners and open
 * endpoints retain exact coordinates/IDs; the closed seam also stays pinned.
 * Spacing is a nominal upper bound, not a fixed count; minDivisions lets sharp
 * Zig Zag require one interior peak even in a shorter pinned span. */
export function contourArcStops(data: SplinePathData, contourId: string, sampler: SplineArcSampler, spacing: number, sharp: ReadonlySet<string>, minDivisions = 1): { distance: number; id?: string; pinned: boolean }[] {
  const contour = data.contours[contourId]
  const pins = sampler.anchors.filter((anchor, i) => i === 0 || sharp.has(anchor.id) || !contour.closed && i === sampler.anchors.length - 1)
  if (pins.at(-1)!.distance !== sampler.length) pins.push({ distance: sampler.length, id: contour.pointIds[0] })
  const result: { distance: number; id?: string; pinned: boolean }[] = [{ ...pins[0], pinned: true }]
  for (let i = 1; i < pins.length; i++) {
    const a = pins[i - 1], b = pins[i], count = Math.max(minDivisions, contour.closed && pins.length === 2 ? 3 : 1, Math.ceil((b.distance - a.distance) / spacing))
    if (count + result.length > 8193) throw new Error('Spline modifier vertex budget exceeded. Increase spacing.')
    for (let k = 1; k <= count; k++) result.push(k === count ? { ...b, pinned: true } : { distance: a.distance + (b.distance - a.distance) * k / count, pinned: false })
  }
  return result
}

/** Replace explicit contours by connected line records, retaining Object and
 * contour identity, holes and all unselected records. Only supplied pinned IDs
 * survive; output has Corner points and no curve handles. Existing topology,
 * lock and boundary validators reject unsafe output atomically. */
export function replaceWithPolylines(data: SplinePathData, objectIds: readonly string[], replacements: readonly ContourPolyline[], label: string): SplinePathData {
  const allocate = createSplineIdAllocator((['points', 'handles', 'segments', 'contours', 'subShapes'] as const).flatMap(key => Object.keys(data[key])))
  const replaced = new Set(replacements.flatMap(item => data.contours[item.contourId].pointIds))
  const next = { ...data, points: { ...data.points }, handles: Object.fromEntries(Object.entries(data.handles).filter(([, handle]) => !replaced.has(handle.pointId))), segments: { ...data.segments }, contours: { ...data.contours } }
  for (const replacement of replacements) {
    const contour = data.contours[replacement.contourId], vertices = replacement.vertices
    if (vertices.length < (contour.closed ? 3 : 2)) throw new Error(`${label} cannot collapse a contour.`)
    const pointIds = vertices.map(vertex => {
      const id = vertex.id ?? allocate('pt'), old = data.points[id]
      next.points[id] = old?.type === 'corner' && old.x === vertex.x && old.y === vertex.y ? old : { id, x: vertex.x, y: vertex.y, type: 'corner' }
      return id
    })
    const segmentIds = pointIds.slice(contour.closed ? 0 : 1).map((_, i) => {
      const id = allocate('seg'); next.segments[id] = { id, type: 'line', fromPointId: pointIds[i], toPointId: pointIds[(i + 1) % pointIds.length] }; return id
    })
    next.contours[contour.id] = { ...contour, pointIds, segmentIds }
  }
  const output = markEditedSubShapes(data, retainSplineContours(next, next.contours))
  if (Object.keys(output.points).length > 8192) throw new Error('Spline modifier output exceeds 8,192 vertices.')
  assertSplineTopology(output); assertSplineLocks(data, output); validateSplineObjectEdit(data, output, objectIds, label)
  return output
}

/** Validated shared stage setup; native whole-Object ownership and source
 * budgets apply. Samplers/vertex buffers are temporary and never persisted. */
export function samplingSelection(data: SplinePathData, objectIds: readonly string[]) {
  assertSplineTopology(data)
  return { ...splineObjectSelection(data, objectIds), sharp: new Set(sharpSplineCornerIds(data)), budget: { vertices: 0, lengthSamples: 0 } as SplineSamplingBudget }
}

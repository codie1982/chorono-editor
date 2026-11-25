import type { SplinePathData } from '../../types/spline'
import { Matrix2D } from '../../geometry/Matrix2D'
import { sharpSplineCornerIds } from '../corners'
import { validateCornerBoundaries } from '../corners/validateBoundaries'
import { assertSplineLocks, assertSplineTopology, retainSplineContours } from '../topology'
import { createSplineIdAllocator } from '../util/uid'
import { filletSpline } from './filletSpline'
import { assertFilletSettings, FILLET_LIMITS } from './types'
import { findRoundedSplineCorners } from './roundedCorners'

/** Absolute-radius modern corner operation in source-local px. Targets are
 * Corner/Bézier Corner anchors; empty IDs mean all eligible anchors, never
 * Smooth/Bézier points. Circular runs between straight sides are reconstructed
 * as private virtual sharp corners, then use the SAME native Fillet solver and
 * topology splice as ordinary corners. Radius is replaced, not added; no scene
 * transforms, source mutation, generator reconstruction or second solver.
 * A selected anchor on a recognized run targets that whole corner. Its source
 * IDs are resolved before reconstruction; unrelated records/owners survive.
 * Non-circular/curved-flank runs cannot be inferred and are left ineligible.
 * Up to 64 combined corners and existing Fillet boundary budgets; invalid
 * targets, locks, overlaps, hole changes or impossible radii throw atomically.
 * Caller must namespace generated IDs (SplineModifier does so deterministically).
 */
export function roundSplineCorners(data: SplinePathData, pointIds: readonly string[], radiusPx: number): SplinePathData {
  assertSplineTopology(data); assertFilletSettings({ radiusPx })
  const cornerType = (id: string) => ['corner', 'bezierCorner'].includes(data.points[id]?.type)
  if (pointIds.some(id => !data.points[id] || !cornerType(id))) throw new Error('Round Corners targets must be existing Corner or Bézier Corner points.')
  const selected = new Set(pointIds), all = !selected.size
  const eligible = all ? new Set(Object.keys(data.points).filter(cornerType)) : selected
  const rounded = findRoundedSplineCorners(data, eligible)
  const sharp = all ? sharpSplineCornerIds(data).filter(cornerType) : Array.from(selected)
  if (rounded.length > FILLET_LIMITS.points) throw new Error(`Round Corners supports at most ${FILLET_LIMITS.points} corners.`)
  const allocate = createSplineIdAllocator((['points', 'handles', 'segments', 'contours', 'subShapes'] as const).flatMap(key => Object.keys(data[key])))
  const remap = new Map<string, string>(), removedSegments = new Set<string>(), affected = new Set<string>()
  const points = { ...data.points }
  for (const run of rounded) {
    const id = allocate('pt'); points[id] = { id, ...run.corner, type: 'corner' }
    for (const pointId of run.pointIds) remap.set(pointId, id)
    for (const segmentId of run.segmentIds) removedSegments.add(segmentId)
    affected.add(run.contourId)
  }
  const segments = Object.fromEntries(Object.entries(data.segments).filter(([id]) => !removedSegments.has(id)).map(([id, edge]) => [id,
    remap.has(edge.fromPointId) || remap.has(edge.toPointId) ? { ...edge, fromPointId: remap.get(edge.fromPointId) ?? edge.fromPointId, toPointId: remap.get(edge.toPointId) ?? edge.toPointId } : edge]))
  const contours = Object.fromEntries(Object.entries(data.contours).map(([id, contour]) => {
    if (!affected.has(id)) return [id, contour]
    const segmentIds = contour.segmentIds.filter(edge => !removedSegments.has(edge))
    return [id, { ...contour, segmentIds, pointIds: [...segmentIds.map(edge => segments[edge].fromPointId), ...(!contour.closed ? [segments[segmentIds.at(-1)!].toPointId] : [])] }]
  }))
  const restored = retainSplineContours({ ...data, points, segments }, contours)
  const targets = Array.from(new Set([...sharp.map(id => remap.get(id) ?? id), ...rounded.map(run => remap.get(run.pointIds[0])!)]))
  if (!targets.length) throw new Error('No sharp or supported circular corners on Corner / Bézier Corner points. Select eligible corners or change the upstream geometry.')
  const output = filletSpline({ data: restored, pointIds: targets, radiusPx, matrix: [1, 0, 0, 1, 0, 0] }).data
  assertSplineLocks(data, output)
  const changed = new Set([...sharp, ...rounded.flatMap(run => run.pointIds)])
  validateCornerBoundaries(data, output, changed, Matrix2D.identity(), 'Round Corners')
  return output
}

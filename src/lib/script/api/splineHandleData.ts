import type { SplinePathData, SplinePointType } from '@/lib/types/spline'
import { assertSafeScriptData } from './scriptData'

export const POINT_TYPES: readonly SplinePointType[] = ['corner', 'smooth', 'bezier', 'bezierCorner']
export const finiteCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
export function assertCoordinates(...values: unknown[]): void {
  if (!values.every(finiteCoordinate)) throw new Error('Spline coordinates must be finite numbers.')
}
export function assertPointType(type: unknown): asserts type is SplinePointType {
  if (!POINT_TYPES.includes(type as SplinePointType)) throw new Error('Unknown spline point type.')
}
export function assertBoolean(value: unknown): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error('Expected a boolean spline option.')
}

/** Validate the normalized topology before a command reaches the editor. No
 * renderer references, class instances or external host objects are accepted. */
export function assertSplineTopology(data: SplinePathData): void {
  assertSafeScriptData(data)
  if (!data || !['nonzero', 'evenodd'].includes(data.fillRule)) throw new Error('Invalid spline fill rule.')
  const records = ['points', 'handles', 'segments', 'contours', 'subShapes'] as const
  for (const key of records) {
    const record = data[key]
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Invalid spline ${key}.`)
    const limit = key === 'handles' ? 20000 : 10000
    if (Object.keys(record).length > limit) throw new Error(`Spline ${key} limit exceeded.`)
    for (const [id, item] of Object.entries(record)) {
      if (!item || item.id !== id || !/^[\w-]{1,128}$/.test(id)) throw new Error(`Invalid spline ${key} id.`)
    }
  }
  for (const point of Object.values(data.points)) {
    assertCoordinates(point.x, point.y); assertPointType(point.type)
    if (point.locked !== undefined) assertBoolean(point.locked)
  }
  const handleKeys = new Set<string>()
  for (const handle of Object.values(data.handles)) {
    if (!data.points[handle.pointId] || !['in', 'out'].includes(handle.kind)) throw new Error('Spline handle references a missing point.')
    const key = `${handle.pointId}:${handle.kind}`
    if (handleKeys.has(key)) throw new Error('A spline point can have only one handle of each kind.')
    handleKeys.add(key)
    assertCoordinates(handle.x, handle.y); assertBoolean(handle.locked)
  }
  const ownedPoints = new Set<string>(), ownedSegments = new Set<string>()
  for (const contour of Object.values(data.contours)) {
    assertBoolean(contour.closed)
    if (!Array.isArray(contour.pointIds) || !Array.isArray(contour.segmentIds) || contour.pointIds.length < 2
      || contour.segmentIds.length !== contour.pointIds.length - (contour.closed ? 0 : 1)) throw new Error('Invalid spline contour order.')
    for (const id of contour.pointIds) {
      if (!data.points[id] || ownedPoints.has(id)) throw new Error('Missing or shared spline contour point.')
      ownedPoints.add(id)
    }
    contour.segmentIds.forEach((id, index) => {
      const segment = data.segments[id]
      if (!segment || ownedSegments.has(id) || segment.fromPointId !== contour.pointIds[index]
        || segment.toPointId !== contour.pointIds[(index + 1) % contour.pointIds.length]) throw new Error('Invalid spline segment connectivity.')
      if (!['line', 'quadratic', 'cubic'].includes(segment.type)) throw new Error('Unknown spline segment type.')
      for (const control of [segment.control1, segment.control2]) if (control) assertCoordinates(control.x, control.y)
      ownedSegments.add(id)
    })
  }
  const ownedContours = new Set<string>()
  for (const subShape of Object.values(data.subShapes)) {
    if (!Array.isArray(subShape.contourIds) || !subShape.contourIds.length) throw new Error('A spline sub-shape needs at least one contour.')
    for (const id of subShape.contourIds) {
      if (!data.contours[id] || ownedContours.has(id)) throw new Error('Missing or shared spline sub-shape contour.')
      ownedContours.add(id)
    }
  }
  if (ownedPoints.size !== Object.keys(data.points).length || ownedSegments.size !== Object.keys(data.segments).length
    || ownedContours.size !== Object.keys(data.contours).length) throw new Error('Orphan spline geometry is not allowed.')
}

/** Locks belong to geometry, so a split that shortens a locked control or a
 * transform that moves a locked point is rejected as one whole edit. */
export function assertSplineLocks(before: SplinePathData, after: SplinePathData, unlock?: string): void {
  for (const key of ['points', 'handles'] as const) {
    for (const item of Object.values(before[key])) {
      if (!item.locked) continue
      const next = after[key][item.id]
      const comparison = (value: unknown) => {
        if (unlock === `${key}.${item.id}` && value && typeof value === 'object') {
          const copy = { ...value as Record<string, unknown> }; delete copy.locked; return copy
        }
        return value
      }
      if (JSON.stringify(comparison(item)) !== JSON.stringify(comparison(next))) throw new Error(`Spline ${key === 'points' ? 'point' : 'handle'} '${item.id}' is locked.`)
    }
  }
}

/** Editing a generated primitive freezes its creation params as metadata.
 * Unrelated sub-shapes and newly appended generators retain their identity. */
export function markEditedSubShapes(before: SplinePathData, after: SplinePathData): SplinePathData {
  const changed = new Set<string>()
  const pointContours = new Map<string, string>()
  for (const contour of Object.values(before.contours)) {
    for (const id of contour.pointIds) pointContours.set(id, contour.id)
    if (contour !== after.contours[contour.id]
      || contour.pointIds.some(id => before.points[id] !== after.points[id])
      || contour.segmentIds.some(id => before.segments[id] !== after.segments[id])) changed.add(contour.id)
  }
  for (const handle of [...Object.values(before.handles), ...Object.values(after.handles)]) {
    if (before.handles[handle.id] !== after.handles[handle.id]) {
      const owner = pointContours.get(handle.pointId)
      if (owner) changed.add(owner)
    }
  }
  let subShapes = after.subShapes
  for (const previous of Object.values(before.subShapes)) {
    const next = subShapes[previous.id]
    if (next?.source === 'edited' && next.editable) continue
    if (!next || (!previous.contourIds.some(id => changed.has(id)) && previous.contourIds === next.contourIds)) continue
    if (subShapes === after.subShapes) subShapes = { ...subShapes }
    subShapes[previous.id] = { ...next, source: 'edited', editable: true }
  }
  return subShapes === after.subShapes ? after : { ...after, subShapes }
}

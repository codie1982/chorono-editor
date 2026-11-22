import type { ChronoScene } from '../../types'
import type { SplinePathData } from '../../types/spline'
import { editableSplineLayer } from '../../spline/edit/authoringGuard'
import { splineEditCommand } from '../../editor/spline/editCommand'
import { makeUpdateLayerCmd } from '../../editor/commands-layer'
import { assertSplineLocks, assertSplineTopology } from './splineHandleData'

/** Align legacy Script Console/MCP spline mutations with native writer guards.
 * No deleted-key pruning: referenced/keyed geometry refuses atomically. Pure
 * append/metadata edits remain possible beside unrelated animated coordinates.
 * Explicit lock toggles are metadata and may unlock only their addressed record.
 * Scene reads happen at invocation; returned native command rechecks ownership. */
export function scriptSplineMutation(scene: ChronoScene, layerId: string, next: SplinePathData, label: string, unlock?: string) {
  const layer = editableSplineLayer(scene, layerId), before = layer.spline
  assertSplineLocks(before, next, unlock); assertSplineTopology(next)
  if (unlock) {
    const delegate = makeUpdateLayerCmd(layerId, { spline: next }, layer)
    return { label, execute(current: ChronoScene) {
      if (editableSplineLayer(current, layerId).spline !== before) throw new Error('Spline source changed during lock editing.')
      assertSplineLocks(before, next, unlock); return delegate.execute(current)
    }, undo: (current: ChronoScene) => delegate.undo(current) }
  }
  const removed = (['points', 'handles', 'segments', 'contours', 'subShapes'] as const).some(family => Object.keys(before[family]).some(id => !next[family][id]))
  const topology = removed || Object.values(before.points).some(p => next.points[p.id]?.type !== p.type)
    || Object.values(before.segments).some(edge => { const n = next.segments[edge.id]; return n && (n.type !== edge.type || n.fromPointId !== edge.fromPointId || n.toPointId !== edge.toPointId) })
    || Object.values(before.contours).some(c => { const n = next.contours[c.id]; return n && (c.closed !== n.closed || JSON.stringify(c.pointIds) !== JSON.stringify(n.pointIds) || JSON.stringify(c.segmentIds) !== JSON.stringify(n.segmentIds)) })
  const points = new Set(Object.values(before.points).filter(p => next.points[p.id] && (p.x !== next.points[p.id].x || p.y !== next.points[p.id].y)).map(p => p.id))
  for (const handle of Object.values(before.handles)) { const n = next.handles[handle.id]; if (n && (n.x !== handle.x || n.y !== handle.y)) points.add(handle.pointId) }
  // A newly authored control changes an existing anchor's curve even if the
  // point was already Bezier and the segment already cubic. Treat its owner as
  // edited geometry so a keyed/wired point cannot silently acquire a new curve.
  for (const handle of Object.values(next.handles)) if (!before.handles[handle.id] && before.points[handle.pointId]) points.add(handle.pointId)
  for (const edge of Object.values(before.segments)) if (next.segments[edge.id] && JSON.stringify(edge.control1) !== JSON.stringify(next.segments[edge.id].control1)) { points.add(edge.fromPointId); points.add(edge.toPointId) }
  return splineEditCommand(scene, layerId, topology ? { kind: 'topology' } : points.size ? { kind: 'geometry', ids: Array.from(points) } : { kind: 'metadata' }, () => next, label)
}

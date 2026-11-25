import type { SplinePathData, SplineSegment } from '../../types/spline'
import type { Vec2 } from '../../geometry/CoordinateSystem'
import { splineEdgePath } from '../geometry/elementPaths'
import { uid } from '../util/uid'

/** Read the renderer's canonical control convention through its existing edge
 * converter. Cubic handles and quadratic explicit controls stay consistent. */
export function segmentControls(data: SplinePathData, id: string): Vec2[] {
  const commands = splineEdgePath(data, id).commands, start = commands[0], end = commands[1]
  if (!start || start.type !== 'M' || !end || end.type === 'M' || end.type === 'Z') throw new Error('Invalid spline corner edge geometry.')
  return [start, ...(end.type === 'C' ? [{ x: end.x1, y: end.y1 }, { x: end.x2, y: end.y2 }] : end.type === 'Q' ? [{ x: end.x1, y: end.y1 }] : []), { x: end.x, y: end.y }]
}

/** Write a retained subcurve into privately copied records. Endpoints/edge IDs
 * already encode the new connectivity. Preserve existing neighbor handle IDs;
 * new cut points get independent corner handles. Shortening one mirror handle
 * changes a surviving mirror point to smooth, preserving the opposite curve. */
export function writeSegmentControls(data: SplinePathData, segment: SplineSegment, controls: Vec2[], allocate: (prefix: string) => string = uid): void {
  if (segment.type === 'quadratic') { data.segments[segment.id] = { ...segment, control1: controls[1] }; return }
  if (segment.type !== 'cubic') return
  for (const [pointId, kind, position] of [[segment.fromPointId, 'out', controls[1]], [segment.toPointId, 'in', controls[2]]] as const) {
    const old = Object.values(data.handles).find(h => h.pointId === pointId && h.kind === kind)
    const id = old?.id ?? allocate('h')
    data.handles[id] = { ...old, id, pointId, kind, ...position, locked: false }
    const point = data.points[pointId]
    if (point.type === 'bezier') data.points[pointId] = { ...point, type: 'smooth' }
  }
}

import type { SplinePathData } from '../../types/spline'
import { moveSplinePoint } from './mutations'

/** Translate distinct selected source anchors and their own handles once, in
 * layer-local px. Reuses the existing single-point contract; unrelated anchors,
 * topology, IDs and layers are shared unchanged. Authoring host checks driven
 * and locked coordinates before calling; no evaluation or key writing occurs. */
export function moveSplinePoints(data: SplinePathData, ids: readonly string[], dx: number, dy: number): SplinePathData {
  if (![dx, dy].every(Number.isFinite) || dx === 0 && dy === 0) return data
  const selected = new Set(ids)
  const moved = Array.from(selected).reduce((next, id) => {
    const point = data.points[id]
    return point ? moveSplinePoint(next, id, point.x + dx, point.y + dy) : next
  }, data)
  // A quadratic owns its control on the edge rather than in point handles.
  // Moving both anchors rigidly must translate those controls as well.
  const segments = { ...moved.segments }
  let changed = false
  for (const segment of Object.values(data.segments)) {
    if (segment.type !== 'quadratic' || !selected.has(segment.fromPointId) || !selected.has(segment.toPointId)) continue
    if (!segment.control1 && !segment.control2) continue
    segments[segment.id] = { ...segment,
      ...(segment.control1 ? { control1: { x: segment.control1.x + dx, y: segment.control1.y + dy } } : {}),
      ...(segment.control2 ? { control2: { x: segment.control2.x + dx, y: segment.control2.y + dy } } : {}),
    }; changed = true
  }
  return changed ? { ...moved, segments } : moved
}

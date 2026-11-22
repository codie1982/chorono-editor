import type { SplinePathData } from '@/lib/types/spline'
import type { Matrix2D } from '@/lib/geometry/Matrix2D'

/** Transform geometry, preserving normalized IDs/topology and inactive payloads.
 * An optional local point set restricts edits to those anchors and attached
 * handles. Explicit segment controls move only when both endpoints participate;
 * shared anchors are transformed once. Omitting the set preserves whole-data
 * conversion. Pure; callers validate source ownership/locks before mutation. */
export function transformSplineData(data: SplinePathData, matrix: Matrix2D, selected?: ReadonlySet<string>): SplinePathData {
  if (matrix.isIdentity() || selected?.size === 0) return data
  const points = Object.fromEntries(Object.entries(data.points).map(([id, point]) =>
    [id, !selected || selected.has(id) ? { ...point, ...matrix.applyToPoint(point) } : point],
  ))
  const handles = Object.fromEntries(Object.entries(data.handles).map(([id, handle]) =>
    [id, !selected || selected.has(handle.pointId) ? { ...handle, ...matrix.applyToPoint(handle) } : handle],
  ))
  const segments = Object.fromEntries(Object.entries(data.segments).map(([id, segment]) =>
    [id, selected && !(selected.has(segment.fromPointId) && selected.has(segment.toPointId)) ? segment : {
      ...segment,
      ...(segment.control1 ? { control1: matrix.applyToPoint(segment.control1) } : {}),
      ...(segment.control2 ? { control2: matrix.applyToPoint(segment.control2) } : {}),
    }],
  ))
  return { ...data, points, handles, segments }
}

import type { SplinePathData } from '@/lib/types/spline'
import type { Matrix2D } from '@/lib/geometry/Matrix2D'
import type { Vec2 } from '@/lib/geometry/CoordinateSystem'

/** Transform geometry, preserving normalized IDs/topology and inactive payloads.
 * An optional local point set restricts edits to those anchors and attached
 * handles. Explicit segment controls move only when both endpoints participate;
 * shared anchors are transformed once. Omitting the set preserves whole-data
 * conversion. Pure; callers validate source ownership/locks before mutation. */
export function transformSplineData(data: SplinePathData, matrix: Matrix2D, selected?: ReadonlySet<string>): SplinePathData {
  if (matrix.isIdentity() || selected?.size === 0) return data
  return mapSplineCoordinates(data, point => matrix.applyToPoint(point), selected)
}

/** Map every selected anchor, attached handle and jointly selected explicit
 * edge control through one source-local coordinate policy. Pure callbacks must
 * return finite detached coordinates; callers validate geometry/topology and
 * tangent-type invariants for nonlinear maps. Unselected records retain their
 * identity. Affine transforms and radial modeling share this record traversal. */
export function mapSplineCoordinates(data: SplinePathData, map: (point: Vec2) => Vec2, selected?: ReadonlySet<string>): SplinePathData {
  if (selected?.size === 0) return data
  const points = Object.fromEntries(Object.entries(data.points).map(([id, point]) =>
    [id, !selected || selected.has(id) ? { ...point, ...map(point) } : point],
  ))
  const handles = Object.fromEntries(Object.entries(data.handles).map(([id, handle]) =>
    [id, !selected || selected.has(handle.pointId) ? { ...handle, ...map(handle) } : handle],
  ))
  const segments = Object.fromEntries(Object.entries(data.segments).map(([id, segment]) =>
    [id, selected && !(selected.has(segment.fromPointId) && selected.has(segment.toPointId)) ? segment : {
      ...segment,
      ...(segment.control1 ? { control1: map(segment.control1) } : {}),
      ...(segment.control2 ? { control2: map(segment.control2) } : {}),
    }],
  ))
  return { ...data, points, handles, segments }
}

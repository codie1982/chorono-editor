import type { SplinePathData } from '@/lib/types/spline'
import type { Matrix2D } from '@/lib/geometry/Matrix2D'

/** Transform all geometry together, preserving normalized ids and topology. */
export function transformSplineData(data: SplinePathData, matrix: Matrix2D): SplinePathData {
  const points = Object.fromEntries(Object.entries(data.points).map(([id, point]) =>
    [id, { ...point, ...matrix.applyToPoint(point) }],
  ))
  const handles = Object.fromEntries(Object.entries(data.handles).map(([id, handle]) =>
    [id, { ...handle, ...matrix.applyToPoint(handle) }],
  ))
  const segments = Object.fromEntries(Object.entries(data.segments).map(([id, segment]) =>
    [id, {
      ...segment,
      ...(segment.control1 ? { control1: matrix.applyToPoint(segment.control1) } : {}),
      ...(segment.control2 ? { control2: matrix.applyToPoint(segment.control2) } : {}),
    }],
  ))
  return { ...data, points, handles, segments }
}

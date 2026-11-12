import type { Layer } from '../../types'
import { writePropertyPath } from '../../scene/properties/writePropertyPath'
import { moveSplinePoint, moveSplineHandle } from '../../spline'
import { splineCoordinateAddress } from '../../spline/animation/splineCoordinateAddress'
import { isVec2 } from '../../geometry/CoordinateSystem'

/** Apply a constant source edit through the owning geometry semantics. Spline
 * point moves translate attached handles, and handle moves preserve the point's
 * coupling policy. Other leaf fields reuse the immutable source writer. Runtime
 * frame projection/capture is separate and never moves an undeclared channel. */
export function writeInputExpressionValue(layer: Layer, path: string, value: unknown): Layer {
  const match = splineCoordinateAddress(path)
  if (!match || !layer.spline) return writePropertyPath(layer, path, value, true)
  const { family, id, component } = match, element = family === 'points' ? layer.spline.points[id] : layer.spline.handles[id]
  if (!element) throw new Error('Spline element no longer exists.')
  const position = isVec2(value) ? value : component && typeof value === 'number' ? { ...element, [component]: value } : null
  if (!position) throw new Error('Spline coordinates require finite numeric/vector values.')
  const spline = family === 'points' ? moveSplinePoint(layer.spline, id, position.x, position.y)
    : moveSplineHandle(layer.spline, layer.spline.handles[id].pointId, layer.spline.handles[id].kind, position.x, position.y)
  return { ...layer, spline }
}

import type { SplinePathData } from '../../../types/spline'
import { Matrix2D } from '../../../geometry/Matrix2D'
import { defaultRepeaterResolver } from '../../../repeater/RepeaterResolver'
import { extractSplineObjects, assertSplineTopology, assertSplineLocks, markEditedSubShapes, remapSplineData } from '../../topology'
import { computeSplineBounds } from '../../geometry/computeSplineBounds'
import { transformSplineData } from '../../geometry/transformSplineData'
import { mergeSplineData } from '../../factory/mergeSplineData'
import { appendSplineObjects } from '../../creation/appendSplineObjects'
import { splineObjectSelection, validateSplineObjectEdit } from '../../edit/objectSelection'

export interface SplineRepeatOptions {
  count: number; mode: 'linear' | 'polar'; stepX: number; stepY: number; rotationStep: number; scaleStep: number
  radius: number; startAngle: number; sweepAngle: number; orientToAngle: boolean
}

/** Repeat selected Objects as one motif around their shared local bounds center.
 * Delegates all placement matrices to RepeaterResolver; 1..32 total instances.
 * Linear instance zero is the unchanged original. Polar instances lie on the
 * radius (0°=up), with a half-open full circle and inclusive partial sweep. Each
 * copied Object owns independent contours/holes and shares ONLY layer paint.
 * Same-layer geometry, never new scene layers or opacity overrides. Source IDs
 * survive in instance zero; fresh copy IDs are namespaced by SplineModifier.
 * Affine nonsingular placement preserves validated per-Object hole topology;
 * overlaps BETWEEN separate Objects/copies are intentional. Preflight 8,192
 * vertices / 128 Objects / 128 contours; extreme matrices/coordinates refuse.
 * No source mutation, retained resolver cache or serialized runtime resources. */
export function repeatSplineObjects(data: SplinePathData, objectIds: readonly string[], options: SplineRepeatOptions): SplinePathData {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 32 || !['linear', 'polar'].includes(options.mode)
    || ![options.stepX, options.stepY, options.rotationStep, options.radius, options.startAngle, options.sweepAngle, options.scaleStep].every(Number.isFinite)
    || Math.max(Math.abs(options.stepX), Math.abs(options.stepY), options.radius) > 10000 || options.radius < 0 || options.scaleStep < .1 || options.scaleStep > 10
    || Math.abs(options.rotationStep) > 360 || Math.abs(options.startAngle) > 360 || options.sweepAngle <= 0 || options.sweepAngle > 360 || typeof options.orientToAngle !== 'boolean') throw new Error('Invalid spline Repeater settings.')
  assertSplineTopology(data); splineObjectSelection(data, objectIds)
  if (options.count === 1 && options.mode === 'linear') return data
  const source = extractSplineObjects(data, objectIds), copies = options.count - 1
  if (Object.keys(data.points).length + Object.keys(source.points).length * copies > 8192
    || Object.keys(data.contours).length + Object.keys(source.contours).length * copies > 128
    || Object.keys(data.subShapes).length + objectIds.length * copies > 128) throw new Error('Spline Repeater output budget exceeded. Reduce count or source complexity.')
  validateSplineObjectEdit(data, data, objectIds, 'Repeater')
  const bounds = computeSplineBounds(source), x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2
  const endAngle = options.startAngle + (options.sweepAngle === 360 ? options.sweepAngle * (options.count - 1) / options.count : options.sweepAngle)
  const instances = defaultRepeaterResolver.resolve({ sourceLayerId: '', count: options.count, mode: options.mode,
    transformStep: { x: options.stepX, y: options.stepY, rotation: options.rotationStep, scaleX: options.scaleStep, scaleY: options.scaleStep },
    polar: { radius: options.radius, startAngle: options.startAngle, endAngle, orientToAngle: options.orientToAngle } })
  let output = data
  for (const instance of instances) {
    const matrix = Matrix2D.translation(x, y).multiply(instance.matrix).multiply(Matrix2D.translation(-x, -y))
    if (Math.abs(matrix.determinant()) < 1e-8) throw new Error('Spline Repeater scale chain becomes degenerate.')
    const transformed = markEditedSubShapes(source, transformSplineData(source, matrix))
    if (Object.values(transformed.points).some(point => ![point.x, point.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1e7))
      || Object.values(transformed.handles).some(handle => ![handle.x, handle.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1e7))
      || Object.values(transformed.segments).some(edge => [edge.control1, edge.control2].some(point => point && ![point.x, point.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1e7)))) throw new Error('Spline Repeater coordinates exceed the modeling budget.')
    output = instance.index === 0 ? mergeSplineData(output, transformed) : appendSplineObjects(output, remapSplineData(transformed, output, true).data).data
  }
  assertSplineTopology(output); assertSplineLocks(data, output)
  return output
}

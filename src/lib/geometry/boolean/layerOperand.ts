import type { Layer } from '../../types'
import { ShapeToPathConverter } from '../ShapeToPathConverter'
import type { PathDefinition } from '../PathCommand'
import { splineToPathDefinition } from '../../spline/splineToPath'
import { assertSplineTopology } from '../../spline/topology'
import { subShapeData } from '../../spline/selection'
import { BOOLEAN_LIMITS } from './types'

/** Geometry-only local adapter shared by transient preview and saved recipes.
 * Closed Shape/Spline/SubShape only; preserves all source IDs/data and fill
 * semantics. Command admission precedes dense primitive conversion. Full ring
 * seams normalize into two closed loops solely for area clipping. */
export function layerBooleanOperand(layer: Layer, subShapeId?: string): { path: PathDefinition; fillRule: 'nonzero' | 'evenodd' } {
  let path: PathDefinition, fillRule: 'nonzero' | 'evenodd' = 'nonzero'
  if (layer.type === 'shape') {
    if (!layer.size) throw new Error('Shape size is missing.')
    const kind = layer.shapeKind ?? layer.shape ?? 'rect'
    const count = ShapeToPathConverter.estimateCommandCount(kind, layer.size, layer.shapeParams, layer.style?.cornerRadius)
    if (!Number.isSafeInteger(count) || count <= 0 || count > BOOLEAN_LIMITS.commands) throw new Error('Boolean path-command budget exceeded.')
    path = ShapeToPathConverter.convert(kind, layer.size, layer.shapeParams, layer.style?.cornerRadius)
    if (kind === 'ring' && Math.abs((layer.shapeParams?.endAngle ?? 360) - (layer.shapeParams?.startAngle ?? 0)) === 360) {
      const split = (path.commands.length - 1) / 2, inner = path.commands[split]
      if (inner.type !== 'L') throw new Error('Unexpected full-ring primitive path.')
      path = { closed: true, commands: [...path.commands.slice(0, split - 1), { type: 'Z' }, { type: 'M', x: inner.x, y: inner.y }, ...path.commands.slice(split + 1, -2), { type: 'Z' }] }
    }
  } else if (layer.type === 'spline' && layer.spline && !layer.booleanResultFor) {
    const data = layer.spline
    if (Object.keys(data.points).length + Object.keys(data.handles).length > BOOLEAN_LIMITS.commands * 3) throw new Error('Spline source exceeds the preview record budget.')
    assertSplineTopology(data)
    if (subShapeId && !data.subShapes[subShapeId]) throw new Error('A selected spline Object no longer exists.')
    const selected = subShapeId ? subShapeData(data, subShapeId) : data
    const contours = Object.values(selected.subShapes).flatMap(sub => sub.contourIds.map(id => data.contours[id]))
    if (!contours.length || contours.some(contour => !contour.closed)) throw new Error('Boolean inputs must have closed contours; open stroke contours are unsupported.')
    if (contours.reduce((sum, contour) => sum + contour.segmentIds.length + 2, 0) > BOOLEAN_LIMITS.commands) throw new Error('Boolean path-command budget exceeded.')
    path = splineToPathDefinition(selected); fillRule = data.fillRule
  } else throw new Error('Boolean preview supports source Basic Shapes and Spline Objects only.')
  return { path, fillRule }
}

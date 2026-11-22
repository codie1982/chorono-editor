import { SplineModifier } from './SplineModifier'
import type { GeometryModifierDescriptor, ModifierGeometry } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { numberSetting, enumSetting, targetSetting } from '../settings'
import { PlanarOutlineBackend } from '../../spline/outline/PlanarOutlineBackend'
import { outlineToSpline } from '../../spline/outline/outlineToSpline'
import { subShapeData } from '../../spline/geometry/elementPaths'
import { splineToPathDefinition } from '../../spline/splineToPath'
import { removeSplineContours } from '../../spline/topology'
import { mergeSplineData } from '../../spline/factory/mergeSplineData'
import { Matrix2D } from '../../geometry/Matrix2D'

/** Parallel-boundary modifier over the shared planar solver. Distances are local
 * pixels. Holes and unselected contours constrain offset admission; open ends
 * remain open. Output replaces selected contours, never appends a scene layer. */
export class OffsetModifier extends SplineModifier {
  static readonly descriptor: GeometryModifierDescriptor = {
    type: 'offset', label: 'Offset', category: 'spline', inputs: ['spline'], output: 'spline', addable: true, legacySplineTool: true,
    fields: [
      { key: 'distancePx', label: 'Distance', kind: 'number', min: .01, max: 10000, step: .1, unit: 'px' },
      { key: 'side', label: 'Direction', kind: 'select', options: ['inside', 'outside', 'left', 'right', 'both'].map(value => ({ value, label: value })) },
      { key: 'join', label: 'Join', kind: 'select', options: ['miter', 'bevel', 'round'].map(value => ({ value, label: value })) },
      { key: 'miterLimit', label: 'Miter limit', kind: 'number', min: 1, max: 100, step: .1 },
      { key: 'tolerancePx', label: 'Curve tolerance', kind: 'number', min: .05, max: 5, step: .05, unit: 'px' },
      { key: 'contourIds', label: 'Contours', kind: 'contours' },
    ],
  }
  /** Defaults for a newly owned instance; empty targets mean all eligible elements. */
  static defaults(input: ModifierGeometry) { return { distancePx: 1, side: input.kind === 'spline' && Object.values(input.spline.contours).every(c => c.closed) ? 'outside' : 'left', join: 'miter', miterLimit: 4, tolerancePx: .25, contourIds: [] } }
  readonly descriptor = OffsetModifier.descriptor
  validate(): void {
    numberSetting(this.settings, 'distancePx', .01, 10000); numberSetting(this.settings, 'miterLimit', 1, 100)
    numberSetting(this.settings, 'tolerancePx', .05, 5); enumSetting(this.settings, 'side', ['inside', 'outside', 'left', 'right', 'both'])
    enumSetting(this.settings, 'join', ['miter', 'bevel', 'round']); targetSetting(this.settings, 'contourIds')
  }
  protected evaluateSpline(data: SplinePathData): SplinePathData {
    const requested = targetSetting(this.settings, 'contourIds'), ids = requested.length ? requested : Object.keys(data.contours)
    if (ids.some(id => !data.contours[id])) throw new Error('Offset contour no longer exists.')
    const result = new PlanarOutlineBackend().compute({ distancePx: numberSetting(this.settings, 'distancePx', .01, 10000),
      side: enumSetting(this.settings, 'side', ['inside', 'outside', 'left', 'right', 'both']),
      join: enumSetting(this.settings, 'join', ['miter', 'bevel', 'round']), miterLimit: numberSetting(this.settings, 'miterLimit', 1, 100),
      tolerancePx: numberSetting(this.settings, 'tolerancePx', .05, 5),
      inputs: Object.values(data.subShapes).filter(sub => sub.contourIds.some(id => ids.includes(id))).map(sub => ({
        name: sub.name, path: splineToPathDefinition(subShapeData(data, sub.id)), fillRule: data.fillRule,
        indices: sub.contourIds.flatMap((id, i) => ids.includes(id) ? [i] : []),
      })),
    })
    return mergeSplineData(removeSplineContours(data, new Set(ids)), outlineToSpline(result, Matrix2D.identity(), data.fillRule))
  }
}

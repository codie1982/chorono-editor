import { SplineModifier } from './SplineModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { numberSetting, targetSetting } from '../settings'
import { modifierObjectTargets } from './objectTargets'
import { resampleSplineObjects } from '../../spline/modeling/parametric'

/** Object-scoped, immutable arc resampling. Class owns static settings; the
 * shared sampler/builder owns exact curve evaluation, topology and budgets. */
export class PathResampleModifier extends SplineModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'pathResample', label: 'Path Resample', category: 'spline', inputs: ['spline'], output: 'spline', addable: true,
    description: 'Redistribute points by arc length. Output is a polyline; endpoints and sharp corners stay fixed. Spacing is a maximum: tighter curve tolerance can add points.',
    fields: [{ key: 'spacingPx', label: 'Max spacing', kind: 'number', min: .1, max: 10000, step: 1, unit: 'local px' },
      { key: 'tolerancePx', label: 'Curve tolerance', kind: 'number', min: .01, max: 10, step: .05, unit: 'local px' },
      { key: 'objectIds', label: 'Objects', kind: 'objects' }] }
  static defaults() { return { spacingPx: 20, tolerancePx: .25, objectIds: [] } }
  readonly descriptor = PathResampleModifier.descriptor
  validate(): void { numberSetting(this.settings, 'spacingPx', .1, 10000); numberSetting(this.settings, 'tolerancePx', .01, 10); targetSetting(this.settings, 'objectIds') }
  protected evaluateSpline(data: SplinePathData): SplinePathData {
    return resampleSplineObjects(data, modifierObjectTargets(data, this.settings), numberSetting(this.settings, 'spacingPx', .1, 10000), numberSetting(this.settings, 'tolerancePx', .01, 10))
  }
}

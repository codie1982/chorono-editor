import { CornerModifier } from './CornerModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { filletSpline } from '../../spline/fillet'
import { numberSetting, targetSetting } from '../settings'

/** Radius-based circular fillets through the canonical native solver, retaining
 * its tangent/curve error admission instead of substituting chamfer distance. */
export class FilletModifier extends CornerModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'fillet', label: 'Fillet', category: 'spline', inputs: ['spline'], output: 'spline', addable: true,
    fields: [{ key: 'radiusPx', label: 'Radius', kind: 'number', min: .1, max: 10000, step: .1, unit: 'px' },
      { key: 'pointIds', label: 'Corners', kind: 'points' }] }
  /** Defaults for a newly owned instance; empty targets mean all eligible elements. */
  static defaults() { return { radiusPx: 1, pointIds: [] } }
  readonly descriptor = FilletModifier.descriptor
  validate(): void { numberSetting(this.settings, 'radiusPx', .1, 10000); targetSetting(this.settings, 'pointIds') }
  protected evaluateSpline(data: SplinePathData): SplinePathData {
    return filletSpline({ data, pointIds: this.targets(data), matrix: [1, 0, 0, 1, 0, 0], radiusPx: numberSetting(this.settings, 'radiusPx', .1, 10000) }).data
  }
}

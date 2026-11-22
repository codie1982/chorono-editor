import { CornerModifier } from './CornerModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { chamferSpline } from '../../spline/chamfer'
import { numberSetting, targetSetting } from '../settings'

/** Local-space straight corner cuts using the canonical native Chamfer solver. */
export class ChamferModifier extends CornerModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'chamfer', label: 'Chamfer', category: 'spline', inputs: ['spline'], output: 'spline', addable: true,
    fields: [{ key: 'distancePx', label: 'Cut distance', kind: 'number', min: .1, max: 10000, step: .1, unit: 'px' },
      { key: 'pointIds', label: 'Corners', kind: 'points' }] }
  /** Defaults for a newly owned instance; empty targets mean all eligible elements. */
  static defaults() { return { distancePx: 1, pointIds: [] } }
  readonly descriptor = ChamferModifier.descriptor
  validate(): void { numberSetting(this.settings, 'distancePx', .1, 10000); targetSetting(this.settings, 'pointIds') }
  protected evaluateSpline(data: SplinePathData): SplinePathData {
    return chamferSpline({ data, pointIds: this.targets(data), matrix: [1, 0, 0, 1, 0, 0], distancePx: numberSetting(this.settings, 'distancePx', .1, 10000) }).data
  }
}

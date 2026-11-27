import { SplineModifier } from './SplineModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { numberSetting, targetSetting } from '../settings'
import { modifierObjectTargets } from './objectTargets'
import { zigZagSplineObjects } from '../../spline/modeling/parametric'

/** Static sharp normal displacement over the shared arc sampler. No random
 * state/time or second execution pipeline is introduced. */
export class ZigZagModifier extends SplineModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'zigZag', label: 'Zig Zag', category: 'spline', inputs: ['spline'], output: 'spline', addable: true,
    description: 'Make sharp polyline peaks alternating across the path. Corners and endpoints stay pinned; peak spacing is evenly distributed per span. Amplitude 0 preserves the input.',
    fields: [{ key: 'amplitudePx', label: 'Amplitude', kind: 'number', min: 0, max: 10000, step: 1, unit: 'local px' },
      { key: 'spacingPx', label: 'Max peak spacing', kind: 'number', min: .1, max: 10000, step: 1, unit: 'local px' },
      { key: 'objectIds', label: 'Objects', kind: 'objects' }] }
  static defaults() { return { amplitudePx: 5, spacingPx: 20, objectIds: [] } }
  readonly descriptor = ZigZagModifier.descriptor
  validate(): void { numberSetting(this.settings, 'amplitudePx', 0, 10000); numberSetting(this.settings, 'spacingPx', .1, 10000); targetSetting(this.settings, 'objectIds') }
  protected evaluateSpline(data: SplinePathData): SplinePathData {
    return zigZagSplineObjects(data, modifierObjectTargets(data, this.settings), numberSetting(this.settings, 'amplitudePx', 0, 10000), numberSetting(this.settings, 'spacingPx', .1, 10000))
  }
}

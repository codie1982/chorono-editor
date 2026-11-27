import { SplineModifier } from './SplineModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { enumSetting, numberSetting, targetSetting } from '../settings'
import { modifierObjectTargets } from './objectTargets'
import { puckerBloatSplineObjects, type PuckerBloatOptions } from '../../spline/modeling/parametric'

/** Source-preserving radial control-cage adapter. Each Object owns its bounds
 * center; Custom shares explicit local center coordinates. Settings stay static. */
export class PuckerBloatModifier extends SplineModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'puckerBloat', label: 'Pucker & Bloat', category: 'spline', inputs: ['spline'], output: 'spline', addable: true,
    description: 'Deform anchors and controls radially: negative puckers, positive bloats. Uses each Object center, or the Custom center fields. Layer transform stays fixed.',
    fields: [{ key: 'amountPct', label: 'Amount', kind: 'number', min: -100, max: 100, step: 1, unit: '%' },
      { key: 'centerMode', label: 'Center', kind: 'select', options: [{ value: 'object', label: 'Each Object bounds' }, { value: 'custom', label: 'Custom local center' }] },
      { key: 'centerX', label: 'Custom center X', kind: 'number', min: -1e7, max: 1e7, step: 1, unit: 'local px' },
      { key: 'centerY', label: 'Custom center Y', kind: 'number', min: -1e7, max: 1e7, step: 1, unit: 'local px' },
      { key: 'objectIds', label: 'Objects', kind: 'objects' }] }
  static defaults() { return { amountPct: 20, centerMode: 'object', centerX: 0, centerY: 0, objectIds: [] } }
  readonly descriptor = PuckerBloatModifier.descriptor
  /** Read one fully validated domain record, shared by validation/execution. */
  private options(): PuckerBloatOptions {
    return { amountPct: numberSetting(this.settings, 'amountPct', -100, 100), centerMode: enumSetting(this.settings, 'centerMode', ['object', 'custom'] as const),
      centerX: numberSetting(this.settings, 'centerX', -1e7, 1e7), centerY: numberSetting(this.settings, 'centerY', -1e7, 1e7) }
  }
  validate(): void { this.options(); targetSetting(this.settings, 'objectIds') }
  protected evaluateSpline(data: SplinePathData): SplinePathData { return puckerBloatSplineObjects(data, modifierObjectTargets(data, this.settings), this.options()) }
}

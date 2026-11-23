import { SplineModifier } from './SplineModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { enumSetting, numberSetting, targetSetting } from '../settings'
import { modifierObjectTargets } from './objectTargets'
import { repeatSplineObjects, type SplineRepeatOptions } from '../../spline/modeling/parametric'

/** Same-layer linear/polar copies, distinct from the scene Repeater layer.
 * Reuses its placement resolver while the modifier owns settings/record scope. */
export class SplineRepeaterModifier extends SplineModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'splineRepeater', label: 'Repeater', category: 'spline', inputs: ['spline'], output: 'spline', addable: true,
    description: 'Repeat selected Objects as one motif in this spline, sharing layer paint. Count is total instances. Linear starts with the original; Polar places all instances around the motif center (0° is up).',
    fields: [{ key: 'count', label: 'Count', kind: 'number', min: 1, max: 32, step: 1 },
      { key: 'mode', label: 'Layout', kind: 'select', options: [{ value: 'linear', label: 'Linear' }, { value: 'polar', label: 'Polar' }] },
      { key: 'stepX', label: 'Linear step X', kind: 'number', min: -10000, max: 10000, step: 1, unit: 'local px' },
      { key: 'stepY', label: 'Linear step Y', kind: 'number', min: -10000, max: 10000, step: 1, unit: 'local px' },
      { key: 'rotationStep', label: 'Linear rotation step', kind: 'number', min: -360, max: 360, step: 1, unit: '°' },
      { key: 'scaleStep', label: 'Linear scale step', kind: 'number', min: .1, max: 10, step: .1 },
      { key: 'radius', label: 'Polar radius', kind: 'number', min: 0, max: 10000, step: 1, unit: 'local px' },
      { key: 'startAngle', label: 'Polar start angle', kind: 'number', min: -360, max: 360, step: 1, unit: '°' },
      { key: 'sweepAngle', label: 'Polar sweep', kind: 'number', min: .1, max: 360, step: 1, unit: '°' },
      { key: 'orientToAngle', label: 'Polar orient to angle', kind: 'boolean' }, { key: 'objectIds', label: 'Objects', kind: 'objects' }] }
  static defaults() { return { count: 3, mode: 'linear', stepX: 120, stepY: 0, rotationStep: 0, scaleStep: 1, radius: 100, startAngle: 0, sweepAngle: 360, orientToAngle: false, objectIds: [] } }
  readonly descriptor = SplineRepeaterModifier.descriptor
  /** Validate even inactive mode fields so saved records remain portable. */
  private options(): SplineRepeatOptions {
    const count = numberSetting(this.settings, 'count', 1, 32)
    if (!Number.isInteger(count)) throw new Error('Repeater count must be an integer.')
    if (typeof this.settings.orientToAngle !== 'boolean') throw new Error('Repeater orientation must be boolean.')
    return { count, mode: enumSetting(this.settings, 'mode', ['linear', 'polar'] as const), stepX: numberSetting(this.settings, 'stepX', -10000, 10000),
      stepY: numberSetting(this.settings, 'stepY', -10000, 10000), rotationStep: numberSetting(this.settings, 'rotationStep', -360, 360),
      scaleStep: numberSetting(this.settings, 'scaleStep', .1, 10), radius: numberSetting(this.settings, 'radius', 0, 10000),
      startAngle: numberSetting(this.settings, 'startAngle', -360, 360), sweepAngle: numberSetting(this.settings, 'sweepAngle', .1, 360), orientToAngle: this.settings.orientToAngle }
  }
  validate(): void { this.options(); targetSetting(this.settings, 'objectIds') }
  protected evaluateSpline(data: SplinePathData): SplinePathData { return repeatSplineObjects(data, modifierObjectTargets(data, this.settings), this.options()) }
}

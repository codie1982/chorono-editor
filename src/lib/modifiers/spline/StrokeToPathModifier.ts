import { SplineModifier } from './SplineModifier'
import type { GeometryModifierDescriptor } from '../geometryTypes'
import type { SplinePathData } from '../../types/spline'
import { targetSetting } from '../settings'
import { SplineBandBackend } from '../../spline/band/SplineBandBackend'
import { bandSelection } from '../../spline/band/selection'
import { applySplineBand } from '../../spline/band/applyBand'
import { bandSettingsFields, defaultBandDraft, readBandDraft } from '../../spline/band/settingsFields'

/** Parametric counterpart of native Outline. Reuses exactly the same band
 * solver, targets Objects explicitly or all stage-input Objects, and evaluates
 * in stack order from retained source. Legacy outline records stay untouched.
 * Generated Object IDs are stabilized by SplineModifier; paint is independent
 * of source geometry and remains in Properties, not modifier settings. */
export class StrokeToPathModifier extends SplineModifier {
  static readonly descriptor: GeometryModifierDescriptor = { type: 'strokeToPath', label: 'Stroke to Path', category: 'spline', inputs: ['spline'], output: 'spline', addable: true,
    description: 'Creates editable closed bands with holes. Width/dashes use local px; shape paint is controlled in Properties.',
    fields: [...bandSettingsFields, { key: 'keepSource', label: 'Keep source', kind: 'boolean' }, { key: 'objectIds', label: 'Objects', kind: 'objects' }] }
  static defaults() { return { ...defaultBandDraft(), keepSource: false, objectIds: [] } }
  readonly descriptor = StrokeToPathModifier.descriptor
  validate(): void {
    readBandDraft(this.settings); targetSetting(this.settings, 'objectIds')
    if (typeof this.settings.keepSource !== 'boolean') throw new Error('Invalid Keep source option.')
  }
  protected evaluateSpline(data: SplinePathData): SplinePathData {
    const ids = targetSetting(this.settings, 'objectIds'), chains = bandSelection(data, 'object', ids.length ? ids : Object.keys(data.subShapes))
    const settings = readBandDraft(this.settings), result = new SplineBandBackend().compute({ data, chains, settings })
    return applySplineBand(data, chains, result, this.settings.keepSource === true).data
  }
}

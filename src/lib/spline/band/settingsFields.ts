import type { ModifierField } from '../../modifiers/types'
import type { SplineBandSettings } from './types'
import { defaultBandSettings, assertBandSettings } from './types'
import { enumSetting, numberSetting } from '../../modifiers/settings'
import { parseStrokeDash } from '../../paint/strokeStyle'

/** One schema for native geometry controls and parametric Stroke to Path.
 * Paint remains in Properties; fields are static geometry settings only. */
export const bandSettingsFields: readonly ModifierField[] = [
  { key: 'widthPx', label: 'Width', kind: 'number', min: .02, max: 20000, unit: 'local px' },
  { key: 'alignment', label: 'Alignment', kind: 'select', options: ['center', 'inside', 'outside', 'left', 'right'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) })) },
  { key: 'cap', label: 'Caps', kind: 'select', options: ['butt', 'round', 'square'].map(value => ({ value, label: value })) },
  { key: 'join', label: 'Corners', kind: 'select', options: ['miter', 'round', 'bevel'].map(value => ({ value, label: value })) },
  { key: 'miterLimit', label: 'Miter limit', kind: 'number', min: 1, max: 100 },
  { key: 'dashEnabled', label: 'Dashed', kind: 'boolean' },
  { key: 'dashSequence', label: 'Dash / Gap sequence', kind: 'text' },
  { key: 'dashOffset', label: 'Dash offset', kind: 'number', min: -1e7, max: 1e7, unit: 'local px' },
  { key: 'spacingPx', label: 'Maximum vertex spacing', kind: 'number', min: .1, max: 10000, unit: 'local px' },
  { key: 'tolerancePx', label: 'Curve tolerance', kind: 'number', min: .05, max: 5, unit: 'local px' },
]
/** Fresh serializable draft; dash text is parsed at the domain boundary. */
export function defaultBandDraft() { const { dashArray, ...settings } = defaultBandSettings; return { ...settings, dashSequence: dashArray.join(' ') } }
/** Validate draft fields without coercion. Partial/invalid UI text never enters
 * a worker or persistent enabled recipe. No mutation or hidden layer access. */
export function readBandDraft(draft: Readonly<Record<string, unknown>>): SplineBandSettings {
  if (typeof draft.dashSequence !== 'string') throw new Error('Provide a dash/gap sequence.')
  if (typeof draft.dashEnabled !== 'boolean') throw new Error('Invalid dashed option.')
  const settings: SplineBandSettings = {
    widthPx: numberSetting(draft, 'widthPx', .02, 20000), alignment: enumSetting(draft, 'alignment', ['center', 'inside', 'outside', 'left', 'right']),
    cap: enumSetting(draft, 'cap', ['butt', 'round', 'square']), join: enumSetting(draft, 'join', ['miter', 'round', 'bevel']),
    miterLimit: numberSetting(draft, 'miterLimit', 1, 100), spacingPx: numberSetting(draft, 'spacingPx', .1, 10000), tolerancePx: numberSetting(draft, 'tolerancePx', .05, 5),
    dashEnabled: draft.dashEnabled, dashArray: parseStrokeDash(draft.dashSequence), dashOffset: numberSetting(draft, 'dashOffset', -1e7, 1e7),
  }
  assertBandSettings(settings); return settings
}

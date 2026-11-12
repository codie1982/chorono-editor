// ── Text LayerDefinition ──────────────────────────────────────────────────────

import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import { FONT_WEIGHTS, FONT_STYLES } from '../../../text/fontOptions'
import { newTextLayer } from '@/lib/defaults'
import { transformGroup, appearanceGroup } from '../sharedSchemas'

// NOTE: text layers render their inspector via hand-written JSX in
// PropertiesPanel.tsx (NOT SchemaPanel). This schema is the machine-readable
// contract consumed by the timeline (animatable detection), AI CapabilityContext
// and any future schema tooling — keep it in sync with the panel.
//
// Runtime animation reality (renderer.ts:drawText): only `text.fontSize` is
// currently evaluated from keyframe overrides. Other props edit statically.
const textGroup = (): PropertyGroup => ({
  title: 'Text',
  schemas: [
    { id: 'value',         path: 'text.value',         group: 'Text', label: 'Content',        valueType: 'string',  animatable: false, defaultValue: '' },
    { id: 'fontFamily',    path: 'text.fontFamily',    group: 'Text', label: 'Font',           valueType: 'string',  animatable: false, defaultValue: 'sans-serif' },
    { id: 'fontWeight',    path: 'text.fontWeight',    group: 'Text', label: 'Weight',         valueType: 'select',  options: FONT_WEIGHTS.map(([value,label]) => ({value,label})), animatable: false, defaultValue: 'normal' },
    { id: 'fontStyle',     path: 'text.fontStyle',     group: 'Text', label: 'Style',          valueType: 'select', options: FONT_STYLES,  animatable: false, defaultValue: 'normal' },
    { id: 'fontSize',      path: 'text.fontSize',      group: 'Text', label: 'Size',           valueType: 'number',  animatable: true,  defaultValue: 24, min: 1 },
    { id: 'color',         path: 'text.color',         group: 'Text', label: 'Color',          valueType: 'color',   animatable: true,  defaultValue: '#FFFFFF' },
    { id: 'letterSpacing', path: 'text.letterSpacing', group: 'Text', label: 'Letter Spacing', valueType: 'number',  animatable: true,  defaultValue: 0 },
    { id: 'uppercase',     path: 'text.uppercase',     group: 'Text', label: 'Uppercase',      valueType: 'boolean', animatable: false, defaultValue: false },
    { id: 'underline',     path: 'text.underline',     group: 'Text', label: 'Underline',      valueType: 'boolean', animatable: false, defaultValue: false },
  ],
  showWhen: (l) => l.type === 'text',
})

export const textDefinition: LayerDefinition = {
  kind:      'text',
  label:     'Text',
  iconKey:   'text',
  category:  'Text',
  createDefault: () => newTextLayer(),
  getPropertyGroups: () => [transformGroup(), appearanceGroup(), textGroup()],
}

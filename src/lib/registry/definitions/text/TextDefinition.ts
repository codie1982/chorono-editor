// ── Text LayerDefinition ──────────────────────────────────────────────────────

import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import { newTextLayer } from '@/lib/defaults'
import { transformGroup, appearanceGroup } from '../sharedSchemas'

const textGroup = (): PropertyGroup => ({
  title: 'Text',
  schemas: [
    { id: 'value',         path: 'text.value',         group: 'Text', label: 'Content',        valueType: 'string',  animatable: false, defaultValue: '' },
    { id: 'fontSize',      path: 'text.fontSize',      group: 'Text', label: 'Size',           valueType: 'number',  animatable: true,  defaultValue: 24, min: 1 },
    { id: 'color',         path: 'text.color',         group: 'Text', label: 'Color',          valueType: 'color',   animatable: true,  defaultValue: '#FFFFFF' },
    { id: 'fontFamily',    path: 'text.fontFamily',    group: 'Text', label: 'Font',           valueType: 'string',  animatable: false, defaultValue: 'sans-serif' },
    { id: 'letterSpacing', path: 'text.letterSpacing', group: 'Text', label: 'Letter Spacing', valueType: 'number',  animatable: true,  defaultValue: 0 },
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

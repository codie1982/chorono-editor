// ── Repeater LayerDefinition ──────────────────────────────────────────────────

import type { Layer } from '@/lib/types'
import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import { DEFAULT_TRANSFORM } from '@/lib/defaults'
import { transformGroup, appearanceGroup } from '../sharedSchemas'

let repeaterCounter = 0

export function newRepeaterLayer(): Layer {
  repeaterCounter++
  return {
    id:    `repeater_${repeaterCounter}_${Date.now().toString(36).slice(-4)}`,
    name:  `Repeater ${repeaterCounter}`,
    type:  'repeater',
    transform: { ...DEFAULT_TRANSFORM },
    opacity:   1,
    repeater: {
      sourceLayerId: '',       // user must set
      count:         5,
      mode:          'linear',
      transformStep: { x: 40, y: 0 },
    },
  }
}

const repeaterGroup = (): PropertyGroup => ({
  title: 'Repeater',
  schemas: [
    { id: 'source',   path: 'repeater.sourceLayerId', group: 'Repeater', label: 'Source Layer ID', valueType: 'string', animatable: false, defaultValue: '' },
    { id: 'count',    path: 'repeater.count',         group: 'Repeater', label: 'Count',           valueType: 'number', animatable: true,  defaultValue: 5, min: 1, max: 200, step: 1 },
    { id: 'mode',     path: 'repeater.mode',          group: 'Repeater', label: 'Mode',            valueType: 'select', animatable: false, defaultValue: 'linear',
      options: [{ value: 'linear', label: 'Linear' }, { value: 'polar', label: 'Polar' }],
    },
    { id: 'stepX',    path: 'repeater.transformStep.x',        group: 'Repeater', label: 'Step X',        valueType: 'number', animatable: true, defaultValue: 40 },
    { id: 'stepY',    path: 'repeater.transformStep.y',        group: 'Repeater', label: 'Step Y',        valueType: 'number', animatable: true, defaultValue: 0  },
    { id: 'stepRot',  path: 'repeater.transformStep.rotation', group: 'Repeater', label: 'Step Rotation', valueType: 'angle',  animatable: true, defaultValue: 0  },
    { id: 'polarRadius',  path: 'repeater.polar.radius',     group: 'Repeater', label: 'Polar Radius',     valueType: 'number', animatable: true, defaultValue: 100 },
    { id: 'polarStart',   path: 'repeater.polar.startAngle', group: 'Repeater', label: 'Polar Start °',    valueType: 'angle',  animatable: true, defaultValue: 0   },
    { id: 'polarEnd',     path: 'repeater.polar.endAngle',   group: 'Repeater', label: 'Polar End °',      valueType: 'angle',  animatable: true, defaultValue: 360 },
  ],
  showWhen: (l) => l.type === 'repeater',
})

export const repeaterDefinition: LayerDefinition = {
  kind:     'repeater',
  label:    'Repeater',
  iconKey:  'repeater',
  category: 'Groups',
  createDefault: () => newRepeaterLayer(),
  getPropertyGroups: () => [transformGroup(), appearanceGroup(), repeaterGroup()],
}

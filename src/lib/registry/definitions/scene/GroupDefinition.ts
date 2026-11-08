// ── Group LayerDefinition ─────────────────────────────────────────────────────

import type { Layer } from '@/lib/types'
import type { LayerDefinition } from '../../LayerDefinition'
import { DEFAULT_TRANSFORM } from '@/lib/defaults'
import { transformGroup, appearanceGroup } from '../sharedSchemas'

let groupCounter = 0

export function newGroupLayer(): Layer {
  groupCounter++
  return {
    id:        `group_${groupCounter}_${Date.now().toString(36).slice(-4)}`,
    name:      `Group ${groupCounter}`,
    type:      'group',
    transform: { ...DEFAULT_TRANSFORM },
    opacity:   1,
  }
}

export const groupDefinition: LayerDefinition = {
  kind:     'group',
  label:    'Group',
  iconKey:  'group',
  category: 'Groups',
  createDefault: () => newGroupLayer(),
  propertyGroupsAreStatic: true,
  getPropertyGroups: () => [transformGroup(), appearanceGroup()],
}

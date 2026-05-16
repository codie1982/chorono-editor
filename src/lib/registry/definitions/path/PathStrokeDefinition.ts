// ── PathStroke LayerDefinition ───────────────────────────────────────────────
//
// pathStroke is an existing layer kind (legacy from before Sprint 4) for
// orbiting light / draw-on / worm-trail effects. We keep its rich custom UI
// in PropertiesPanel for now; this definition just registers it so the
// Add Layer menu and registry lookups work uniformly.

import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import { newPathStrokeLayer } from '@/lib/defaults'
import { transformGroup, appearanceGroup } from '../sharedSchemas'

const pathStrokeStyleGroup = (): PropertyGroup => ({
  title: 'Path Stroke',
  schemas: [
    { id: 'pSStrokeColor', path: 'pathStroke.stroke.color', group: 'Path Stroke', label: 'Stroke Color', valueType: 'color',  animatable: true, defaultValue: '#60A5FA' },
    { id: 'pSStrokeWidth', path: 'pathStroke.stroke.width', group: 'Path Stroke', label: 'Stroke Width', valueType: 'number', animatable: true, defaultValue: 2, min: 0 },
    { id: 'pSTrimOffset',  path: 'pathStroke.trim.offset',         group: 'Path Stroke', label: 'Trim Offset',  valueType: 'percent', animatable: true, defaultValue: 0,   min: 0, max: 1, step: 0.01 },
    { id: 'pSTrimLength',  path: 'pathStroke.trim.segmentLength',  group: 'Path Stroke', label: 'Segment Len',  valueType: 'percent', animatable: true, defaultValue: 0.2, min: 0, max: 1, step: 0.01 },
  ],
  showWhen: (l) => l.type === 'pathStroke',
})

export const pathStrokeDefinition: LayerDefinition = {
  kind:    'pathStroke',
  label:   'Path Stroke',
  iconKey: 'motionPath',
  category: 'Path & Vector',
  createDefault: () => newPathStrokeLayer(),
  getPropertyGroups: () => [transformGroup(), appearanceGroup(), pathStrokeStyleGroup()],
}

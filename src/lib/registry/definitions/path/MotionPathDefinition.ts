// ── Motion Path LayerDefinition (BL-66) ──────────────────────────────────────
//
// Same underlying BezierPath geometry as bezierPath, but pathRole === 'motion'.
// Renders as an editor-only dashed guide; CanvasRenderer skips visible stroke
// during playback. Used as a target for other layers' followPath binding.

import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import { newMotionPathLayer } from '@/lib/defaults'
import { transformGroup, appearanceGroup, strokeGroup } from '../sharedSchemas'
import { bezierPathToNormalized } from './BezierPathDefinition'

const pathGroup = (): PropertyGroup => ({
  title: 'Path',
  schemas: [
    { id: 'closed', path: 'path.closed', group: 'Path', label: 'Closed', valueType: 'boolean', animatable: false, defaultValue: false },
  ],
  showWhen: (l) => l.type === 'path',
})

export const motionPathDefinition: LayerDefinition = {
  kind:    'motionPath',
  label:   'Motion Path',
  iconKey: 'motionPath',
  category: 'Path & Vector',
  createDefault: () => newMotionPathLayer(),
  getPropertyGroups: () => [
    transformGroup(),
    appearanceGroup(),
    pathGroup(),
    strokeGroup(),
  ],
  toPath: bezierPathToNormalized,
}

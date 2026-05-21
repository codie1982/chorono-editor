// ── FrameSequence LayerDefinition (BL-07) ─────────────────────────────────────
//
// Sprite-sheet / animated-frame layer. Created by the import pipeline
// (GifDocumentHandler / sprite-sheet import) with a real assetId, so
// createDefault() returns a harmless placeholder like the other media kinds.

import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import type { Layer } from '@/lib/types'
import { DEFAULT_TRANSFORM } from '@/lib/defaults'
import { transformGroup, appearanceGroup, sizeGroup } from '../sharedSchemas'

const placeholder = (): Layer => ({
  id:        'frameSequence_placeholder',
  name:      'Sprite',
  type:      'frameSequence',
  transform: { ...DEFAULT_TRANSFORM },
  opacity:   1,
})

const frameSequenceGroup = (): PropertyGroup => ({
  title: 'Frame Sequence',
  schemas: [
    { id: 'fps',        path: 'frameSequence.fps',        group: 'Frame Sequence', label: 'FPS',        valueType: 'number',  animatable: false, defaultValue: 12, min: 1,  max: 60, step: 1 },
    { id: 'frameCount', path: 'frameSequence.frameCount', group: 'Frame Sequence', label: 'Frames',     valueType: 'number',  animatable: false, defaultValue: 1,  min: 1,  max: 4096, step: 1 },
    { id: 'columns',    path: 'frameSequence.columns',    group: 'Frame Sequence', label: 'Columns',    valueType: 'number',  animatable: false, defaultValue: 1,  min: 1,  max: 512, step: 1 },
    { id: 'rows',       path: 'frameSequence.rows',       group: 'Frame Sequence', label: 'Rows',       valueType: 'number',  animatable: false, defaultValue: 1,  min: 1,  max: 512, step: 1 },
    { id: 'loop',       path: 'frameSequence.loop',       group: 'Frame Sequence', label: 'Loop',       valueType: 'boolean', animatable: false, defaultValue: true },
    { id: 'objectFit',  path: 'frameSequence.objectFit',  group: 'Frame Sequence', label: 'Object Fit', valueType: 'select',  animatable: false, defaultValue: 'contain',
      options: [
        { value: 'fill',    label: 'Fill'    },
        { value: 'contain', label: 'Contain' },
        { value: 'cover',   label: 'Cover'   },
        { value: 'none',    label: 'None'    },
      ],
    },
  ],
  showWhen: (l) => l.type === 'frameSequence',
})

export const frameSequenceDefinition: LayerDefinition = {
  kind: 'frameSequence',
  label: 'Sprite / Frame Sequence',
  iconKey: 'image',
  category: 'Media',
  createDefault: placeholder,
  getPropertyGroups: () => [transformGroup(), appearanceGroup(), sizeGroup(), frameSequenceGroup()],
}

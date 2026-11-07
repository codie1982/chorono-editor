// ── Image / Video / Audio LayerDefinitions ───────────────────────────────────
//
// These layers are constructed via probe-and-add in page.tsx (because they
// need a file picked from the OS), so createDefault() here returns a
// placeholder layer that page.tsx never uses for actual file uploads.
// The definitions exist so the registry knows about these kinds and so
// PropertiesPanel can render their property schemas generically.

import type { LayerDefinition } from '../../LayerDefinition'
import type { PropertyGroup } from '../../PropertySchema'
import type { Layer } from '@/lib/types'
import { DEFAULT_TRANSFORM } from '@/lib/defaults'
import { transformGroup, appearanceGroup, sizeGroup } from '../sharedSchemas'

// Placeholder factory — never directly invoked by page.tsx for media.
// page.tsx uses newImageLayer/newVideoLayer/newAudioLayer with a real assetId.
const placeholderLayer = (type: Layer['type']): Layer => ({
  id:        `${type}_placeholder`,
  name:      `${type}`,
  type,
  transform: { ...DEFAULT_TRANSFORM },
  opacity:   1,
})

// ── Image ────────────────────────────────────────────────────────────────────

const imageGroup = (): PropertyGroup => ({
  title: 'Image',
  schemas: [
    { id: 'objectFit', path: 'image.objectFit', group: 'Image', label: 'Object Fit', valueType: 'select', animatable: false, defaultValue: 'contain',
      options: [
        { value: 'fill',    label: 'Fill'    },
        { value: 'contain', label: 'Contain' },
        { value: 'cover',   label: 'Cover'   },
        { value: 'none',    label: 'None'    },
      ],
    },
  ],
  showWhen: (l) => l.type === 'image',
})

export const imageDefinition: LayerDefinition = {
  kind: 'image',
  label: 'Image',
  iconKey: 'image',
  category: 'Media',
  createDefault: () => placeholderLayer('image'),
  getPropertyGroups: () => [transformGroup(), appearanceGroup(), sizeGroup(), imageGroup()],
}

// ── Video ────────────────────────────────────────────────────────────────────

const videoGroup = (): PropertyGroup => ({
  title: 'Video',
  schemas: [
    { id: 'volume', path: 'video.volume', group: 'Video', label: 'Volume', valueType: 'percent', animatable: true,  defaultValue: 1, min: 0, max: 1, step: 0.01 },
    { id: 'muted',  path: 'video.muted',  group: 'Video', label: 'Muted',  valueType: 'boolean', animatable: false, defaultValue: false },
    { id: 'loop',   path: 'video.loop',   group: 'Video', label: 'Loop',   valueType: 'boolean', animatable: false, defaultValue: false },
  ],
  showWhen: (l) => l.type === 'video',
})

export const videoDefinition: LayerDefinition = {
  kind: 'video',
  label: 'Video',
  iconKey: 'video',
  category: 'Media',
  createDefault: () => placeholderLayer('video'),
  getPropertyGroups: () => [transformGroup(), appearanceGroup(), sizeGroup(), videoGroup()],
}

// ── Audio ────────────────────────────────────────────────────────────────────

const audioGroup = (): PropertyGroup => ({
  title: 'Audio',
  schemas: [
    { id: 'volume', path: 'audio.volume', group: 'Audio', label: 'Linear Gain', valueType: 'number', animatable: true, defaultValue: 1, min: 0, max: 4, step: 0.01 },
    { id: 'muted',  path: 'audio.muted',  group: 'Audio', label: 'Muted',  valueType: 'boolean', animatable: false, defaultValue: false },
    { id: 'loop',   path: 'audio.loop',   group: 'Audio', label: 'Loop',   valueType: 'boolean', animatable: false, defaultValue: false },
    { id: 'startOffsetMs', path: 'audio.startOffsetMs', group: 'Audio', label: 'Source In (ms)', valueType: 'number', animatable: false, defaultValue: 0, min: 0, step: 1 },
    { id: 'fadeInMs', path: 'audio.fadeInMs', group: 'Audio', label: 'Fade In (ms)', valueType: 'number', animatable: false, defaultValue: 0, min: 0, step: 1 },
    { id: 'fadeOutMs', path: 'audio.fadeOutMs', group: 'Audio', label: 'Fade Out (ms)', valueType: 'number', animatable: false, defaultValue: 0, min: 0, step: 1 },
    { id: 'pan', path: 'audio.pan', group: 'Audio', label: 'Pan', valueType: 'number', animatable: false, defaultValue: 0, min: -1, max: 1, step: 0.01 },
  ],
  showWhen: (l) => l.type === 'audio',
})

export const audioDefinition: LayerDefinition = {
  kind: 'audio',
  label: 'Audio',
  iconKey: 'audio',
  category: 'Media',
  createDefault: () => placeholderLayer('audio'),
  getPropertyGroups: () => [audioGroup()],
}

export const ALL_MEDIA_DEFINITIONS = [imageDefinition, videoDefinition, audioDefinition]

/** Canonical guide routes owned by chorono-web/lib/documentation. Keep existing
 * indexed paths intact; UI grouping must never manufacture a new URL. Fragment
 * entries point at stable task headings in the corresponding guide. */
export const documentationPages = {
  'ai/mcp#open-agent-connections': 'Agent connections',
  'ai/edit-selection#use-the-agent-menu': 'Selection & agent menu',
  'ai/edit-selection#edit-or-ask-about-the-selection': 'Edit or ask about the selection',
  'editor/projects': 'Projects & saving',
  'editor/canvas': 'Canvas',
  'editor/canvas/tools': 'Drawing & transform tools',
  'editor/canvas/selection': 'Advanced selection',
  'editor/canvas/snapping': 'Guides & snapping',
  'editor/canvas/splines': 'Bézier points & splines',
  'editor/canvas/compound-splines': 'Compound spline editing',
  'editor/canvas/spline-modeling': 'Spline modeling',
  'editor/canvas/motion-keys': 'Motion Keys',
  'editor/layers': 'Layers',
  'editor/layers/basic-shapes': 'Basic Shapes',
  'editor/layers/paths': 'Path & Vector',
  'editor/layers/text': 'Text',
  'editor/layers/media': 'Image, video & audio',
  'editor/layers/spline-objects': 'Spline Objects',
  'scripting/splines': 'Spline scripting',
  'editor/layers/particles': 'Particle Emitter',
  'editor/layers/scene-explorer': 'Scene Explorer',
  'editor/layers/cloning': 'Clone & Instance',
  'editor/layers/arrays': 'Arrays',
  'editor/properties': 'Properties',
  'editor/properties/transform': 'Transform & anchor',
  'editor/properties/appearance': 'Fill, stroke & opacity',
  'editor/properties/effects': 'Effects & motion blur',
  'editor/properties/masks': 'Masks',
  'editor/properties/motion': 'Motion presets',
  'editor/properties/interact': 'Interaction',
  'editor/keyframes/inspector': 'Keyframe Inspector',
  'editor/keyframes/spreadsheet': 'Keyframe Spreadsheet',
  'editor/keyframes/timing': 'Keyframe timing',
  'editor/timeline': 'Timeline',
  'editor/timeline/dope-sheet': 'Dope Sheet',
  'editor/timeline/curves': 'Curve Editor',
  'editor/timeline/controllers': 'Controllers & modifiers',
  'editor/timeline/segments': 'Segments',
  'editor/timeline/onion-skin': 'Onion skin',
  'editor/state-machines': 'State Machines',
  'editor/state-machines/parameters': 'Parameters',
  'editor/state-machines/events': 'Events',
  'editor/state-machines/bindings': 'Bindings',
  'editor/state-machines/wires': 'Wires',
  'editor/preview': 'Preview & playback',
  'editor/shortcuts': 'Keyboard shortcuts',
  'editor/resources#read-the-overview': 'Resource overview',
  'editor/resources#media-resources': 'Media resources',
  'editor/resources#cpu-and-gpu-work': 'CPU & GPU resources',
  'editor/resources#rendering-surfaces': 'Rendering surfaces',
  'editor/resources#interaction-diagnostics': 'Interaction diagnostics',
  'export/project-json': 'Project JSON',
  'export/runtime-json': 'Runtime JSON',
  'export/images': 'Image export',
  'export/svg': 'SVG export',
  'export/sequence': 'Image sequence export',
  'editor/properties#animation-expressions-and-formulas': 'Property expressions & formulas',
  'editor/properties#calculate-once-for-operation-settings': 'Calculate once',
  'editor/timeline/controllers#bake-a-property-track-to-keyframes': 'Bake a property track',
  'editor/timeline/controllers#bake-a-live-expression-to-keyframes': 'Bake a live expression',
  'editor/layers/scene-explorer#work-with-a-branch': 'Subtree operations',
  'editor/canvas/snapping#add-and-edit-ruler-guides': 'Ruler guides',
  'editor/canvas/snapping#measure-and-edit-selection-gaps': 'Selection gaps',
  'editor/projects#automatic-local-recovery': 'Local recovery & backups',
} as const

export type DocumentationTopic = keyof typeof documentationPages

/** Return a stable production guide URL with editor Help attribution.
 * URL handles fragment topics so campaign parameters precede the heading hash.
 * This performs no network request or editor state mutation. */
export function documentationUrl(topic: DocumentationTopic): string {
  const url = new URL(topic, 'https://www.chorono.com/docs/')
  url.searchParams.set('utm_source', 'chorono_editor')
  url.searchParams.set('utm_medium', 'referral')
  url.searchParams.set('utm_campaign', 'editor_help')
  return url.toString()
}

/** Open palette categories resolve to their task guide; a closed palette or
 * newly introduced category keeps a useful Layers overview until documented. */
export function layerHelpTopic(open: boolean, category: string): DocumentationTopic {
  const topics: Readonly<Record<string, DocumentationTopic>> = {
    'Basic Shapes': 'editor/layers/basic-shapes',
    'Path & Vector': 'editor/layers/paths',
    Text: 'editor/layers/text',
    Media: 'editor/layers/media',
    'Spline Objects': 'editor/layers/spline-objects',
    Particles: 'editor/layers/particles',
  }
  return open ? topics[category] ?? 'editor/layers' : 'editor/layers'
}

/** Match resource tabs to existing article headings without duplicating pages. */
export const resourceHelpTopics = {
  Overview: 'editor/resources#read-the-overview',
  Media: 'editor/resources#media-resources',
  'CPU / GPU': 'editor/resources#cpu-and-gpu-work',
  Surfaces: 'editor/resources#rendering-surfaces',
  Interaction: 'editor/resources#interaction-diagnostics',
} as const satisfies Record<string, DocumentationTopic>

/** Property tabs have dedicated guides; the general tab remains an overview. */
export const propertyHelpTopics = {
  properties: 'editor/properties',
  effects: 'editor/properties/effects',
  motion: 'editor/properties/motion',
  interact: 'editor/properties/interact',
} as const satisfies Record<string, DocumentationTopic>

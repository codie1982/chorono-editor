/** Serializable editor reference line in composition pixels, independent of
 * layer transforms, cameras and renderers. `v` fixes x; `h` fixes y. Locking
 * prevents interactive moves, not snapping. Hidden lines do not snap. IDs are
 * stable across save/load and undo/redo; this data never draws into exports. */
export interface SceneGuide {
  id: string
  axis: 'v' | 'h'
  position: number
  locked?: boolean
  hidden?: boolean
}

/** Versioned authoring-only payload. Missing metadata on legacy scenes means
 * no custom guides. The scene owns these small records; no DOM/runtime handles
 * or per-frame cursor state are serialized. */
export interface SceneGuideData {
  version: 1
  guides: SceneGuide[]
}

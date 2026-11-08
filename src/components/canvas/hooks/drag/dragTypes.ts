import type { ChronoScene } from '@/lib/types'
import type { Guide } from '@/lib/snap/AlignmentGuides'
import type { ViewportLayerChange } from '@/lib/editor/viewportKeyframes'
import type { CloneForestCommand } from '@/lib/editor/commands-clone-forest'

/** One source-layer edit. Explicit paths retain rendered edits whose desired
 * value happens to equal the authored fallback, but differs from an active key. */
export type CanvasLayerChange = ViewportLayerChange

/** Detached preview state owned by one gesture; overrides never enter scene JSON. */
export interface CanvasDragPreview {
  scene: ChronoScene
  changes: CanvasLayerChange[]
  overrides: Map<string, number>
  guides: Guide[]
  label?: string
  /** Exact prepared forest command behind a clone preview; IDs stay fixed. */
  cloneCommand?: CloneForestCommand
}

/** Backward-compatible aliases; object and motion-key gestures share one
 * authoritative pointer/capture contract. */
export type { EditorPointerSample as CanvasPointerSample,
  EditorPointerStart as CanvasPointerStart } from '../../interactions/EditorPointerSession'

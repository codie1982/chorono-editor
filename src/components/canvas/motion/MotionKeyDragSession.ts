import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { EditorPointerSession, type EditorPointerSessionHost, type EditorPointerStart, type EditorPointerStartOptions } from '../interactions/EditorPointerSession'

export interface MotionKeyPreview {
  scene: ChronoScene
  command: EditorCommand | null
  selectedIds: string[]
  diagnostics: string[]
}

/** Position-key policy for the shared editor pointer lifecycle. The inherited
 * owner handles source/document conflicts, latest release samples, capture,
 * Escape and listener cleanup. This class owns no second baseline/history and
 * regards a prepared native command as the only committable source change. */
export class MotionKeyDragSession extends EditorPointerSession<MotionKeyPreview> {
  constructor(start: EditorPointerStartOptions, host: Omit<EditorPointerSessionHost<MotionKeyPreview>, 'hasChanges'>,
    pointer: EditorPointerStart) {
    super(start, { ...host, hasChanges: preview => preview.command !== null }, pointer)
  }
}

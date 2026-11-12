import { EditorPointerSession, type EditorPointerSessionHost, type EditorPointerStart } from '../interactions/EditorPointerSession'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { ChronoScene } from '@/lib/types'

export interface GuideDragPreview { scene: ChronoScene; command: EditorCommand; changed: boolean }

/** Reference-line gesture policy over the shared source/capture/cancel owner.
 * A ruler click may create a guide; existing-line clicks only select it. All
 * source writes remain one editor transaction and Escape restores the baseline. */
export class GuideDragSession extends EditorPointerSession<GuideDragPreview> {
  constructor(start: { startClientX: number; startClientY: number },
    host: Omit<EditorPointerSessionHost<GuideDragPreview>, 'hasChanges'>, pointer: EditorPointerStart) {
    super({ ...start, allowClick: true }, { ...host, hasChanges: preview => preview.changed }, pointer)
  }
}

import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { makeBatchCmd } from '@/lib/editor/commands-batch'
import { prepareCloneDrag, cloneDragOffsets } from './cloneDragPreview'
import type { ActiveDrag } from '../../types/canvasDragTypes'
import type { CanvasDragPreview, CanvasLayerChange } from './dragTypes'

export interface CanvasDragCommitOptions {
  buildLayerCommitCommands?: (changes: readonly CanvasLayerChange[]) => EditorCommand[]
  onAfterLayerCommit?: (prev: Layer, next: Layer) => void
  onSelectLayer: (id: string | null, shiftHeld?: boolean) => void
  onSelectLayers?: (ids: readonly string[]) => void
  onWarning?: (message: string) => void
}

/** Commit source edits and their animation commands in the same transaction.
 * Construction may reject an unsupported signal/key edit before history changes.
 * The optional legacy notification runs only when no atomic builder is supplied. */
export function commitCanvasDrag(editor: EditorStateReturn, base: ChronoScene, drag: ActiveDrag,
  preview: CanvasDragPreview, options: CanvasDragCommitOptions): void {
  if (drag.kind === 'move' && drag.cloneMode) {
    commitClone(editor, base, drag, preview, options)
    return
  }
  const commands = preview.changes.map(change => makeUpdateLayerCmd(change.prev.id, change.next, change.prev))
  commands.push(...(options.buildLayerCommitCommands?.(preview.changes) ?? []))
  editor.commitTransaction(makeBatchCmd(dragLabel(drag.kind, preview.changes.length), commands))
  if (!options.buildLayerCommitCommands) preview.changes.forEach(change => options.onAfterLayerCommit?.(change.prev, change.next))
}

/** Commit the same forest command used by the visible preview. Legacy direct
 * callers may pass an ordinary move preview; prepare the same clone adapter
 * once as a compatibility path. Every copied root uses evaluated-local delta,
 * retains its original external parent and duplicates all relevant timelines. */
function commitClone(editor: EditorStateReturn, base: ChronoScene, drag: Extract<ActiveDrag, { kind: 'move' }>,
  preview: CanvasDragPreview, options: CanvasDragCommitOptions): void {
  const command = preview.cloneCommand ?? (preview.changes.length
    ? prepareCloneDrag(base, drag).atOffsets(cloneDragOffsets(drag, preview)) : undefined)
  if (!command) { editor.cancelTransaction(); return }
  editor.commitTransaction(command)
  if (command.diagnostics.length) options.onWarning?.(command.diagnostics.join(' '))
  const ids = command.result.suggestedSelection
  if (options.onSelectLayers) options.onSelectLayers(ids)
  else {
    const primary = ids[0] ?? command.result.createdLayerIds[0]
    if (primary) options.onSelectLayer(primary)
  }
}

/** Human-readable undo labels describe the edited responsibility. */
function dragLabel(kind: ActiveDrag['kind'], count: number): string {
  const name = { move: 'Move', rotate: 'Rotate', scaleAxis: 'Scale', resize: 'Resize', anchor: 'Move anchor',
    pathPoint: 'Edit path point', newAnchorDraw: 'Add path point', splinePoint: 'Edit spline point', splineHandle: 'Edit spline handle' }[kind]
  return count > 1 ? `${name} ${count} layers` : name
}

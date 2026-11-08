import type { ActiveDrag } from '../../types/canvasDragTypes'
import type { CanvasDragPreview, CanvasPointerStart } from './dragTypes'
import { EditorPointerSession, type EditorPointerSessionHost } from '../../interactions/EditorPointerSession'

/** Object-drag adapters retain their existing host contract. Only the shared
 * session's change policy is supplied here; geometry and commits stay external. */
export interface CanvasDragSessionHost extends Omit<EditorPointerSessionHost<CanvasDragPreview>, 'hasChanges'> {}

/** Compatibility/policy specialization for object, geometry and copy gestures.
 * Pen point insertion may commit a click; copies require a three-CSS-pixel drag.
 * All source/capture/listener ownership lives in the common session base. */
export class CanvasDragSession extends EditorPointerSession<CanvasDragPreview> {
  constructor(drag: ActiveDrag, host: CanvasDragSessionHost, pointer?: CanvasPointerStart) {
    super({ startClientX: drag.startClientX, startClientY: drag.startClientY,
      allowClick: drag.kind === 'newAnchorDraw',
      minDragDistance: drag.kind === 'move' && drag.cloneMode ? 3 : 0 },
    { ...host, hasChanges: preview => preview.changes.length > 0 }, pointer)
  }
}

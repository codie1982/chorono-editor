import type { ChronoScene, Layer } from '@/lib/types'
import { EditorPointerSession, type EditorPointerSample, type EditorPointerStart } from '@/components/canvas/interactions/EditorPointerSession'
import type { ModelGizmo, ModelSelection } from '@/lib/model3d/inspection/types'
import { transformSelection, type ModelAxis, type ModelTransformTool } from '@/lib/model3d/inspection/transformSelection'
import type { ModelClipEditor } from '../ModelContentTimeline'
interface Preview { scene: ChronoScene; layer: Layer }
/** 3D Move/Rotate/Scale borrows the 2D pointer transaction owner. A drag
 * previews detached model source, then commits one local history step; Apply
 * publishes the detail as one main Undo. The projected axis is measured in
 * CSS pixels while the source converter owns local units/degrees/scale. */
export class ModelGizmoSession extends EditorPointerSession<Preview> {
  constructor(start: EditorPointerStart & { clientX: number; clientY: number }, model: ModelClipEditor, getModel: () => ModelClipEditor,
    selection: ModelSelection, tool: ModelTransformTool, axis: ModelAxis, gizmo: ModelGizmo, clear: () => void) {
    const initial = model.previewLayer, endpoint = gizmo.axes[axis], dx = endpoint.x - gizmo.origin.x, dy = endpoint.y - gizmo.origin.y, length2 = dx * dx + dy * dy
    model.playback.handlePause(); model.editor.beginTransaction()
    super({ startClientX: start.clientX, startClientY: start.clientY, minDragDistance: 2 }, {
      getEditor: () => getModel().editor, eventTarget: window,
      preview: (base, sample: EditorPointerSample) => {
        const projected = length2 > .001 ? ((sample.clientX - start.clientX) * dx + (sample.clientY - start.clientY) * dy) / Math.sqrt(length2) : 0
        const delta = tool === 'move' ? projected / Math.sqrt(Math.max(length2, .001)) * gizmo.unitsPerHandle[axis]
          : tool === 'rotate' ? projected * .6 : Math.exp(Math.max(-700, Math.min(700, projected)) / 100)
        const layer = { ...initial, model3d: transformSelection(initial.model3d!, selection, tool, axis, delta) }
        return { layer, scene: model.commandForLayer(layer, base).execute(base) }
      },
      hasChanges: p => JSON.stringify(p.layer) !== JSON.stringify(initial), show: () => {},
      commit: (base, p) => getModel().editor.commitTransaction(model.commandForLayer(p.layer, base)), clear,
      warning: message => getModel().setError(message), diagnostics: { owner: 'model3d.gizmo' },
    }, start)
  }
}

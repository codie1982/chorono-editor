import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { makeAddLayerCmd } from '@/lib/editor/commands-layer'
import { canPlaceShape, placeShapeInGesture } from '@/lib/editor/placement'
import { canvasPointerWorld } from '../interactions/canvasCoordinates'
import { EditorPointerSession, type EditorPointerSample } from '../interactions/EditorPointerSession'

interface PlacementPreview { scene: ChronoScene; layer: Layer | null; command: EditorCommand | null }

export interface ShapePlacementSessionOptions {
  getEditor: () => EditorStateReturn
  canvas: HTMLCanvasElement
  template: Layer
  start: EditorPointerSample
  eventTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>
  onDraft: (layer: Layer | null) => void
  onClose: (committedId?: string) => void
  onWarning?: (message: string) => void
}

/**
 * One Add → draw gesture, adapting native shape geometry to the shared pointer
 * transaction owner. The caller begins the transaction before construction.
 * The factory template supplies one stable ID and appearance; every preview
 * appends exactly one layer to the same immutable baseline. Existing hierarchy,
 * timelines and source layers are borrowed unchanged.
 *
 * Client pointers are converted using the live canvas rectangle, including zoom
 * and pan. Up to three CSS pixels remains an empty preview; only pointer-up may
 * create default-sized geometry for a click. Larger gestures draw in composition
 * pixels, with Shift constraining shape proportions. A final pointer-up sample
 * commits one ordinary Add command, with no default-size flash on pointer-down.
 * Escape, lost capture, document replacement or conflicting source edits follow
 * EditorPointerSession cancellation. No platform handles enter saved source.
 */
export class ShapePlacementSession extends EditorPointerSession<PlacementPreview> {
  private readonly phase: { finishing: boolean }

  constructor(options: ShapePlacementSessionOptions) {
    if (!canPlaceShape(options.template)) throw new Error('This layer does not support drag placement.')
    if (options.getEditor().getScene().layers.some(layer => layer.id === options.template.id)) {
      throw new Error('The placement layer already belongs to the scene.')
    }
    const start = canvasPointerWorld(options.canvas, options.start.clientX, options.start.clientY)
    const phase = { finishing: false }
    let committedId: string | undefined
    super({ startClientX: options.start.clientX, startClientY: options.start.clientY, allowClick: true }, {
      getEditor: options.getEditor,
      eventTarget: options.eventTarget,
      preview: (base, sample) => {
        const useDefaultSize = Math.hypot(sample.clientX - options.start.clientX, sample.clientY - options.start.clientY) <= 3
        if (useDefaultSize && !phase.finishing) return { scene: base, layer: null, command: null }
        const end = canvasPointerWorld(options.canvas, sample.clientX, sample.clientY)
        const layer = placeShapeInGesture(options.template, start, end, { useDefaultSize, constrain: sample.shiftKey })
        const command = makeAddLayerCmd(layer)
        return { scene: command.execute(base), layer, command }
      },
      hasChanges: preview => preview.command !== null,
      show: preview => options.onDraft(preview.layer),
      commit: (_base, preview) => {
        if (!preview.command || !preview.layer) return
        options.getEditor().commitTransaction(preview.command)
        committedId = preview.layer.id
      },
      clear: () => options.onClose(committedId),
      warning: options.onWarning,
    }, { pointerId: options.start.pointerId, currentTarget: options.canvas })
    this.phase = phase
  }

  /** Distinguish a final click from sub-threshold preview movement. The shared
   * owner still validates the initiating pointer/source and closes exactly once. */
  override finish(sample: EditorPointerSample): void {
    this.phase.finishing = true
    try { super.finish(sample) } finally { this.phase.finishing = false }
  }
}

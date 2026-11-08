import { useCallback, useEffect, useRef,
  type RefObject, type MutableRefObject, type Dispatch, type SetStateAction } from 'react'
import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { Guide } from '@/lib/snap/AlignmentGuides'
import type { SnapEngine } from '@/lib/snap/SnapEngine'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { prepareTransformTargets } from '@/lib/canvas/math/preparedTransforms'
import { createLayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import { unionBounds } from '@/lib/geometry/boundsMath'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import type { ActiveDrag } from '../types/canvasDragTypes'
import { CanvasDragSession } from './drag/CanvasDragSession'
import { previewTransformDrag, type DragWorldBounds } from './drag/transformDragPreview'
import { previewGeometryDrag } from './drag/geometryDragPreview'
import { commitCanvasDrag } from './drag/commitCanvasDrag'
import { prepareCloneDrag, previewCloneDrag } from './drag/cloneDragPreview'
import type { CanvasLayerChange, CanvasPointerStart } from './drag/dragTypes'

interface SnapState {
  master: boolean; grid: boolean; objects: boolean
  points: boolean; guides: boolean; pixel: boolean; size: number
}

export interface UseCanvasDragOptions {
  canvasRef: RefObject<HTMLCanvasElement>
  compositionRef: { current: { width: number; height: number } }
  sceneRef: { current: ChronoScene }
  editorRef: { current: EditorStateReturn }
  snapRef: { current: SnapState }
  engineRef: RefObject<SnapEngine | null>
  guidesRef: { current: Guide[] }
  readScale: () => { sx: number; sy: number }
  setGuides: (g: Guide[]) => void
  setDragHud: Dispatch<SetStateAction<{ x: number; y: number; label: string } | null>>
  setDragOverrides: Dispatch<SetStateAction<Map<string, number>>>
  /** Build animation writes before the source edit commits, in the same undo. */
  buildLayerCommitCommands?: (changes: readonly CanvasLayerChange[]) => EditorCommand[]
  /** Legacy notification, used only without the atomic animation builder. */
  onAfterLayerCommit?: (prev: Layer, next: Layer) => void
  onSelectLayer: (id: string | null, shiftHeld?: boolean) => void
  /** Atomic replacement for a newly created forest's root selection. */
  onSelectLayers?: (ids: readonly string[]) => void
  timeMs?: number
  overrides?: OverrideMap
  /** Timeline/playhead/playback scope. Changing it cancels the current gesture. */
  contextKey?: string
  onWarning?: (message: string) => void
}

export interface UseCanvasDragReturn {
  dragRef: MutableRefObject<ActiveDrag | null>
  /** Call after assigning dragRef and beginning the transaction. Supplying the
   * pointer-down event enables capture and rejects all other pointer ids. */
  startDrag: (pointer?: CanvasPointerStart) => void
  cancelDrag: () => void
}

/** Connect immutable drag previews to the editor's transaction and evaluated
 * frame. The session owns native listeners/capture/cancellation; geometry and
 * source/animation commits have separate adapters. Stable callbacks read refs,
 * while each gesture pins its own frame, bounds and source snapshot. */
export function useCanvasDrag(opts: UseCanvasDragOptions): UseCanvasDragReturn {
  const latest = useRef(opts)
  latest.current = opts
  const dragRef = useRef<ActiveDrag | null>(null)
  const sessionRef = useRef<CanvasDragSession | null>(null)
  const cancelDrag = useCallback(() => { sessionRef.current?.cancel() }, [])

  const startDrag = useCallback((pointer?: CanvasPointerStart) => {
    const drag = dragRef.current
    if (!drag) return
    const start = latest.current, editor = start.editorRef.current
    try {
      if (sessionRef.current) { sessionRef.current.cancel(); throw new Error('Finish the current gesture before starting another drag.') }
      const base = editor.getScene()
      if ((drag.kind === 'move' || drag.kind === 'rotate' || drag.kind === 'scaleAxis') && !drag.targets) {
        const ids = drag.kind === 'move' ? drag.movingLayers.map(item => item.id)
          : drag.multiLayerOrigins?.map(item => item.layerId) ?? [drag.layerId]
        const prepared = prepareTransformTargets(base, ids, start.timeMs ?? 0, start.overrides, { activeId: drag.layerId })
        if (!prepared.ok) throw new Error(prepared.reason)
        drag.targets = prepared.targets
      }
      const bounds = prepareBounds(base, drag, start.timeMs ?? 0, start.overrides)
      const clonePlan = drag.kind === 'move' && drag.cloneMode ? prepareCloneDrag(base, drag) : null
      const initialRect = start.canvasRef.current?.getBoundingClientRect(), initialScale = start.readScale()
      const initialWorld = initialRect ? { x: (drag.startClientX - initialRect.left) * initialScale.sx,
        y: (drag.startClientY - initialRect.top) * initialScale.sy } : null
      sessionRef.current = new CanvasDragSession(drag, {
        getEditor: () => latest.current.editorRef.current, eventTarget: window,
        preview: (snapshot, event) => {
          const live = latest.current, scale = live.readScale(), rect = live.canvasRef.current?.getBoundingClientRect()
          const pointerWorld = { x: rect ? (event.clientX - rect.left) * scale.sx : (event.clientX - drag.startClientX) * scale.sx,
            y: rect ? (event.clientY - rect.top) * scale.sy : (event.clientY - drag.startClientY) * scale.sy }
          const delta = initialWorld && rect ? { x: pointerWorld.x - initialWorld.x, y: pointerWorld.y - initialWorld.y }
            : { x: (event.clientX - drag.startClientX) * scale.sx, y: (event.clientY - drag.startClientY) * scale.sy }
          if (drag.kind === 'move' || drag.kind === 'rotate' || drag.kind === 'scaleAxis') {
            const transformed = previewTransformDrag({ base: snapshot, drag, event, delta,
              pointerWorld,
              dimensions: live.compositionRef.current, bounds, engine: live.engineRef.current })
            return drag.kind === 'move' && clonePlan
              ? previewCloneDrag(snapshot, drag, clonePlan, transformed, event) : transformed
          }
          const snap = live.snapRef.current
          return previewGeometryDrag({ base: snapshot, drag, event, delta,
            snap: { grid: snap.master && snap.grid, pixel: snap.master && snap.pixel, size: snap.size } })
        },
        show: (preview, event) => {
          const live = latest.current
          live.setGuides(preview.guides)
          live.setDragOverrides(preview.overrides)
          live.setDragHud(preview.label ? { x: event.clientX, y: event.clientY, label: preview.label } : null)
        },
        commit: (snapshot, preview) => commitCanvasDrag(latest.current.editorRef.current, snapshot, drag, preview, {
          buildLayerCommitCommands: start.buildLayerCommitCommands,
          onAfterLayerCommit: start.onAfterLayerCommit, onSelectLayer: latest.current.onSelectLayer,
          onSelectLayers: latest.current.onSelectLayers, onWarning: latest.current.onWarning }),
        clear: () => {
          dragRef.current = null; sessionRef.current = null
          const live = latest.current
          live.setGuides([]); live.setDragHud(null); live.setDragOverrides(new Map())
        },
        warning: message => latest.current.onWarning?.(message),
      }, pointer)
    } catch (error) {
      if (editor.isTransactionActive()) editor.cancelTransaction()
      dragRef.current = null
      start.onWarning?.(error instanceof Error ? error.message : String(error))
    }
  }, [])

  useEffect(() => () => { sessionRef.current?.cancel() }, [opts.contextKey])
  return { dragRef, startDrag, cancelDrag }
}

/** Resolve snap geometry once per gesture from its evaluated source frame. Both
 * selected subtrees and their ancestors are excluded from their own snap targets. */
function prepareBounds(scene: ChronoScene, drag: ActiveDrag, timeMs: number, overrides?: OverrideMap): DragWorldBounds {
  if (drag.kind !== 'move') return { moving: null, others: [] }
  const roots = drag.targets?.map(target => target.id) ?? drag.movingLayers.map(mover => mover.id)
  const index = new LayerIndex(scene.layers), excluded = index.subtreeIds(roots)
  for (const id of roots) {
    let parent = index.get(id)?.parentId
    const visited = new Set<string>()
    while (parent && !visited.has(parent)) { visited.add(parent); excluded.add(parent); parent = index.get(parent)?.parentId }
  }
  const bounds = createLayerWorldBoundsResolver(scene, timeMs, overrides)
  const moving = roots.reduce<DragWorldBounds['moving']>((union, id) => {
    const layer = index.get(id)
    const value = layer ? bounds(layer) : null
    return value ? unionBounds(union, value) : union
  }, null)
  const others = scene.layers.flatMap(layer => {
    if (excluded.has(layer.id)) return []
    const value = bounds(layer)
    return value ? [{ id: layer.id, ...value }] : []
  })
  return { moving, others }
}

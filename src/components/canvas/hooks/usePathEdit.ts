import { useCallback, useRef, type MutableRefObject } from 'react'
import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { ActiveDrag } from '../types/canvasDragTypes'
import {
  hitTestPath, hitTestSegment, insertAnchorOnSegment, togglePathClosed,
} from '@/lib/path/pathOps'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'

export interface UsePathEditOptions {
  editorRef: { current: EditorStateReturn }
  sceneRef: { current: ChronoScene }
  dragRef: MutableRefObject<ActiveDrag | null>
  /** Attach the window pointer listeners (from useCanvasDrag). */
  startDrag: () => void
  toolMode?: string
}

export interface UsePathEditReturn {
  /**
   * Pen / path-edit pointerdown on the selected path layer. Returns true if it
   * handled the event (anchor/handle drag, segment insert, or new-anchor draw);
   * false if the caller should fall through to normal layer selection.
   */
  tryStartPathEdit: (
    selectedLayer: Layer,
    cx: number,
    cy: number,
    e: React.PointerEvent,
  ) => boolean
}

/**
 * BL-03 / BL-66 Pen tool + path editing: drags anchors / bezier handles,
 * inserts anchors on segments, closes the path on a quick double-click of the
 * first anchor, and appends new anchors (corner → smooth on drag) in pen mode.
 */
export function usePathEdit(opts: UsePathEditOptions): UsePathEditReturn {
  const { editorRef, sceneRef, dragRef, startDrag, toolMode } = opts

  // Pen-tool close-path double-click detection. First click on the path's first
  // anchor stores the timestamp; a second click within 350ms on the same anchor
  // triggers togglePathClosed instead of starting a drag.
  const closePathClickRef = useRef<{ layerId: string; timeMs: number } | null>(null)

  const tryStartPathEdit = useCallback((
    selectedLayer: Layer, cx: number, cy: number, e: React.PointerEvent,
  ): boolean => {
    if (!selectedLayer.path) return false
    const editor = editorRef.current
    const lx = cx - selectedLayer.transform.x
    const ly = cy - selectedLayer.transform.y
    const penHit = hitTestPath(selectedLayer.path, lx, ly, 8)
    if (penHit) {
      // BL-03: Pen-tool double-click on FIRST anchor of an open path closes it.
      // We detect "quick second click" via the click-time ref so the first
      // click still starts a normal anchor drag — the second-within-350ms
      // upgrades to a close action and bypasses the drag.
      if (
        toolMode === 'pen' &&
        penHit.type === 'anchor' &&
        penHit.anchorIndex === 0 &&
        !selectedLayer.path.closed &&
        selectedLayer.path.anchors.length >= 2
      ) {
        const now = performance.now()
        const last = closePathClickRef.current
        if (last && last.layerId === selectedLayer.id && now - last.timeMs <= 350) {
          // Second click → close the path
          closePathClickRef.current = null
          const closed = togglePathClosed(selectedLayer.path)
          editor.dispatchCommand(makeUpdateLayerCmd(
            selectedLayer.id,
            { ...selectedLayer, path: closed },
            selectedLayer,
          ))
          return true
        }
        closePathClickRef.current = { layerId: selectedLayer.id, timeMs: now }
        // Fall through — start the normal anchor drag for the first click
      }

      editor.beginTransaction()
      dragRef.current = {
        kind: 'pathPoint',
        layerId: selectedLayer.id,
        originalLayer: selectedLayer,
        startClientX: e.clientX,
        startClientY: e.clientY,
        anchorIndex: penHit.anchorIndex,
        part: penHit.type,
      }
      startDrag()
      return true
    }

    // Pen mode + click on a SEGMENT (not an anchor) → insert anchor at the
    // click point so the curve is unchanged but the user can now grab a
    // new control point. Standard Figma/Illustrator behavior. (BL-03)
    if (toolMode === 'pen') {
      const segHit = hitTestSegment(selectedLayer.path, lx, ly, 6)
      if (segHit) {
        const nextPath = insertAnchorOnSegment(selectedLayer.path, segHit.segmentIndex, segHit.t)
        editor.dispatchCommand(makeUpdateLayerCmd(
          selectedLayer.id,
          { ...selectedLayer, path: nextPath },
          selectedLayer,
        ))
        return true
      }

      // BL-66 — Click on empty area: APPEND a provisional corner anchor and
      // start a `newAnchorDraw` drag. If the user drags > 5px before release,
      // we upgrade it to a smooth anchor with bezier handles (outHandle at
      // cursor, inHandle mirrored). Pure-click commits as a corner.
      const provisional = {
        ...selectedLayer,
        path: {
          ...selectedLayer.path,
          anchors: [
            ...selectedLayer.path.anchors,
            { x: lx, y: ly, pointType: 'corner' as const },
          ],
        },
      }
      editor.beginTransaction()
      editor.previewTransaction({
        ...sceneRef.current,
        layers: sceneRef.current.layers.map(l => l.id === selectedLayer.id ? provisional : l),
      })
      dragRef.current = {
        kind: 'newAnchorDraw',
        layerId: selectedLayer.id,
        originalLayer: selectedLayer,
        anchorX: lx,
        anchorY: ly,
        startClientX: e.clientX,
        startClientY: e.clientY,
        anchorIndex: provisional.path.anchors.length - 1,
      }
      startDrag()
      return true
    }

    return false
  }, [editorRef, sceneRef, dragRef, startDrag, toolMode])

  return { tryStartPathEdit }
}

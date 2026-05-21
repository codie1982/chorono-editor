import { useCallback, useRef, useState, type RefObject } from 'react'
import type { ChronoScene } from '@/lib/types'
import {
  layersInRect, layersInCircle, layersInPolygon, layersUnderPaintBrush,
} from '@/lib/selection/canvasShapes'

export type SelectionTool = 'box' | 'lasso' | 'circle' | 'paint'
export type SelectionMode = 'replace' | 'add' | 'subtract'

export type SelectionOverlay =
  | { kind: 'box',    x: number; y: number; w: number; h: number }
  | { kind: 'circle', cx: number; cy: number; r: number }
  | { kind: 'lasso',  points: Array<{ x: number; y: number }> }
  | { kind: 'paint',  cx: number; cy: number; r: number }

const PAINT_BRUSH_RADIUS = 24  // composition px

export interface UseSelectionToolsOptions {
  canvasRef: RefObject<HTMLCanvasElement>
  /** Live scene ref so the geometry hit-tests read the current layers. */
  sceneRef: RefObject<ChronoScene>
  /** Composition dimensions (for the on-screen → composition scale). */
  width: number
  height: number
  selectionContainMode: 'inside' | 'touching'
  onSelectByGeometry?: (layerIds: Set<string>, mode: SelectionMode) => void
}

export interface UseSelectionToolsReturn {
  selectionOverlay: SelectionOverlay | null
  beginSelectionDrag: (
    tool: SelectionTool,
    mode: SelectionMode,
    cx: number,
    cy: number,
    pointerId: number,
  ) => void
}

/**
 * Canvas marquee selection tools (box / lasso / circle / paint). Owns the live
 * drag ref + the SVG overlay state and resolves hit layers on release via the
 * geometry helpers, handing them back through onSelectByGeometry.
 */
export function useSelectionTools(opts: UseSelectionToolsOptions): UseSelectionToolsReturn {
  const { canvasRef, sceneRef, width, height, selectionContainMode, onSelectByGeometry } = opts

  // ref stores the live shape (mutated continuously without re-render) and the
  // modifier mode; a separate React state mirrors enough to drive the overlay.
  const selectionDragRef = useRef<{
    tool: SelectionTool
    mode: SelectionMode
    startX: number; startY: number
    /** For lasso/paint — every point the cursor visited. */
    points: Array<{ x: number; y: number }>
    /** Accumulated paint-mode selection (built across pointermove). */
    paintAcc: Set<string>
  } | null>(null)
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlay | null>(null)

  const handleSelectionDragMove = useCallback((e: PointerEvent) => {
    const drag = selectionDragRef.current
    if (!drag) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = width  / rect.width
    const sy = height / rect.height
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy

    switch (drag.tool) {
      case 'box': {
        const x = Math.min(drag.startX, cx)
        const y = Math.min(drag.startY, cy)
        const w = Math.abs(cx - drag.startX)
        const h = Math.abs(cy - drag.startY)
        setSelectionOverlay({ kind: 'box', x, y, w, h })
        break
      }
      case 'circle': {
        const r = Math.hypot(cx - drag.startX, cy - drag.startY)
        setSelectionOverlay({ kind: 'circle', cx: drag.startX, cy: drag.startY, r })
        break
      }
      case 'lasso': {
        // Skip if too close to last point (prevents thousands of useless verts)
        const last = drag.points[drag.points.length - 1]
        if (Math.hypot(cx - last.x, cy - last.y) >= 3) {
          drag.points.push({ x: cx, y: cy })
          setSelectionOverlay({ kind: 'lasso', points: drag.points.slice() })
        }
        break
      }
      case 'paint': {
        const hits = layersUnderPaintBrush(sceneRef.current!, { x: cx, y: cy }, PAINT_BRUSH_RADIUS)
        hits.forEach((id) => drag.paintAcc.add(id))
        setSelectionOverlay({ kind: 'paint', cx, cy, r: PAINT_BRUSH_RADIUS })
        break
      }
    }
  }, [canvasRef, sceneRef, width, height])

  const handleSelectionDragUp = useCallback((e: PointerEvent) => {
    const drag = selectionDragRef.current
    if (!drag) return
    const canvas = canvasRef.current
    canvas?.releasePointerCapture(e.pointerId)
    window.removeEventListener('pointermove', handleSelectionDragMove)
    window.removeEventListener('pointerup',   handleSelectionDragUp)

    const containMode = selectionContainMode
    let hits: Set<string> = new Set()
    switch (drag.tool) {
      case 'box': {
        const last = drag.points[0]
        const rect2 = canvasRef.current?.getBoundingClientRect()
        if (!rect2) break
        const sx = width  / rect2.width
        const sy = height / rect2.height
        const cx = (e.clientX - rect2.left) * sx
        const cy = (e.clientY - rect2.top)  * sy
        const x = Math.min(last.x, cx), y = Math.min(last.y, cy)
        const w = Math.abs(cx - last.x), h = Math.abs(cy - last.y)
        hits = layersInRect(sceneRef.current!, { x, y, w, h }, containMode)
        break
      }
      case 'circle': {
        const rect2 = canvasRef.current?.getBoundingClientRect()
        if (!rect2) break
        const sx = width  / rect2.width
        const sy = height / rect2.height
        const cx = (e.clientX - rect2.left) * sx
        const cy = (e.clientY - rect2.top)  * sy
        const r = Math.hypot(cx - drag.startX, cy - drag.startY)
        hits = layersInCircle(sceneRef.current!, { x: drag.startX, y: drag.startY, r }, containMode)
        break
      }
      case 'lasso': {
        if (drag.points.length >= 3) {
          hits = layersInPolygon(sceneRef.current!, drag.points, containMode)
        }
        break
      }
      case 'paint': {
        // Paint is always 'touching' semantics — accumulates as user sweeps.
        hits = drag.paintAcc
        break
      }
    }

    onSelectByGeometry?.(hits, drag.mode)
    selectionDragRef.current = null
    setSelectionOverlay(null)
  }, [canvasRef, sceneRef, width, height, onSelectByGeometry, handleSelectionDragMove, selectionContainMode])

  const beginSelectionDrag = useCallback((
    tool: SelectionTool, mode: SelectionMode, cx: number, cy: number, pointerId: number,
  ) => {
    canvasRef.current?.setPointerCapture(pointerId)
    selectionDragRef.current = {
      tool, mode,
      startX: cx, startY: cy,
      points: [{ x: cx, y: cy }],
      paintAcc: new Set<string>(),
    }
    // Initial overlay so the user sees something even on a zero-distance drag.
    if (tool === 'box') {
      setSelectionOverlay({ kind: 'box', x: cx, y: cy, w: 0, h: 0 })
    } else if (tool === 'circle') {
      setSelectionOverlay({ kind: 'circle', cx, cy, r: 0 })
    } else if (tool === 'lasso') {
      setSelectionOverlay({ kind: 'lasso', points: [{ x: cx, y: cy }] })
    } else {
      // paint
      setSelectionOverlay({ kind: 'paint', cx, cy, r: PAINT_BRUSH_RADIUS })
      // Seed with what's under the cursor at click-down
      const drag = selectionDragRef.current!
      const hits = layersUnderPaintBrush(sceneRef.current!, { x: cx, y: cy }, PAINT_BRUSH_RADIUS)
      hits.forEach((id) => drag.paintAcc.add(id))
    }
    window.addEventListener('pointermove', handleSelectionDragMove)
    window.addEventListener('pointerup',   handleSelectionDragUp)
  }, [canvasRef, sceneRef, handleSelectionDragMove, handleSelectionDragUp])

  return { selectionOverlay, beginSelectionDrag }
}

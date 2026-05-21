import {
  useCallback, useEffect, useRef, useState,
  type RefObject, type Dispatch, type SetStateAction,
} from 'react'
import type { ChronoScene } from '@/lib/types'
import type { SplinePrimitiveKind, SplineGeneratorParams } from '@/lib/types/spline'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  splineParamsFromBox, isBoxDragKind, createPolylineSpline,
  createSplinePrimitive, splineToPathDefinition, translateSplineData, mergeSplineData,
} from '@/lib/spline'
import { newSplineLayerFromPrimitive, newSplineLayerFromData } from '@/lib/defaults'
import { pathToSvgString } from '@/lib/geometry'
import { makeUpdateLayerCmd, makeAddLayerCmd } from '@/lib/editor/commands-layer'

type HudState = { x: number; y: number; label: string } | null

export interface UseSplineDrawingOptions {
  canvasRef: RefObject<HTMLCanvasElement>
  compositionRef: RefObject<{ width: number; height: number }>
  sceneRef: RefObject<ChronoScene>
  editorRef: RefObject<EditorStateReturn>
  toolMode?: string
  splineDrawKind?: SplinePrimitiveKind | null
  splineAppendTargetId?: string | null
  onSplineDrawCommit?: () => void
  onSelectLayer: (id: string | null, shiftHeld?: boolean) => void
  setDragHud: Dispatch<SetStateAction<HudState>>
}

export interface UseSplineDrawingReturn {
  /** Live preview path (composition coords, scaled by zoom at render). */
  splinePreview: { d: string; fill: boolean } | null
  /** Begin / continue a spline draw at a composition-space point. */
  onSplineDrawPointerDown: (cx: number, cy: number, pointerId: number) => void
}

/**
 * BL-73 spline drawing tools: box-drag primitives (rect / ellipse / arc / …)
 * and multi-click polyline. Owns the in-progress draw refs + the live preview
 * state, commits the drawn geometry (new layer or appended to the selected
 * spline), and handles Enter/Esc/Backspace while in spline-draw mode.
 */
export function useSplineDrawing(opts: UseSplineDrawingOptions): UseSplineDrawingReturn {
  const {
    canvasRef, compositionRef, sceneRef, editorRef,
    toolMode, splineDrawKind, splineAppendTargetId, onSplineDrawCommit,
    onSelectLayer, setDragHud,
  } = opts

  // In-progress draw lives in refs (mutated without re-render); the live
  // preview svg path is mirrored to React state. Line draw: accumulated click
  // points persist across discrete clicks.
  const splineBoxRef  = useRef<{ startX: number; startY: number } | null>(null)
  const splineLineRef = useRef<{ points: Array<{ x: number; y: number }> } | null>(null)
  const [splinePreview, setSplinePreview] = useState<{ d: string; fill: boolean } | null>(null)

  // Mirror props into refs so window-listener closures read fresh values.
  const splineDrawKindRef = useRef(splineDrawKind)
  useEffect(() => { splineDrawKindRef.current = splineDrawKind }, [splineDrawKind])
  const splineAppendTargetIdRef = useRef(splineAppendTargetId)
  useEffect(() => { splineAppendTargetIdRef.current = splineAppendTargetId }, [splineAppendTargetId])
  const onSplineDrawCommitRef = useRef(onSplineDrawCommit)
  useEffect(() => { onSplineDrawCommitRef.current = onSplineDrawCommit }, [onSplineDrawCommit])

  // Composition-pixel coords from a pointer event.
  const clientToComp = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const { width: cw, height: ch } = compositionRef.current!
    return {
      x: (e.clientX - rect.left) * (cw / rect.width),
      y: (e.clientY - rect.top)  * (ch / rect.height),
    }
  }, [canvasRef, compositionRef])

  /** Commits a freshly-built layer, or appends geometry to the target layer. */
  const commitDrawnSpline = useCallback((
    kind: SplinePrimitiveKind,
    params: SplineGeneratorParams,
    centerX: number,
    centerY: number,
  ) => {
    const targetId = splineAppendTargetIdRef.current
    const target = targetId ? sceneRef.current!.layers.find(l => l.id === targetId) : null

    if (target?.type === 'spline' && target.spline) {
      // Append into the selected spline, offset so it lands where drawn.
      const gen = createSplinePrimitive({ kind, params })
      if (gen) {
        const placed = translateSplineData(gen, centerX - target.transform.x, centerY - target.transform.y)
        const merged = mergeSplineData(target.spline, placed)
        editorRef.current!.dispatchCommand(makeUpdateLayerCmd(target.id, { spline: merged }, target))
      }
    } else {
      const base = newSplineLayerFromPrimitive(kind, params)
      if (base) {
        base.transform.x = centerX
        base.transform.y = centerY
        editorRef.current!.dispatchCommand(makeAddLayerCmd(base))
        onSelectLayer(base.id)
      }
    }
    onSplineDrawCommitRef.current?.()
  }, [sceneRef, editorRef, onSelectLayer])

  const handleSplineBoxMove = useCallback((e: PointerEvent) => {
    const box = splineBoxRef.current
    const kind = splineDrawKindRef.current
    if (!box || !kind) return
    const p = clientToComp(e)
    if (!p) return
    const spec = splineParamsFromBox(kind, { x1: box.startX, y1: box.startY, x2: p.x, y2: p.y })
    if (!spec) return
    const gen = createSplinePrimitive({ kind, params: spec.params })
    if (!gen) return
    const placed = translateSplineData(gen, spec.centerX, spec.centerY)
    const d = pathToSvgString(splineToPathDefinition(placed))
    setSplinePreview({ d, fill: kind !== 'arc' })
    setDragHud({
      x: e.clientX, y: e.clientY,
      label: `${Math.round(Math.abs(p.x - box.startX))} × ${Math.round(Math.abs(p.y - box.startY))}`,
    })
  }, [clientToComp, setDragHud])

  const handleSplineBoxUp = useCallback((e: PointerEvent) => {
    const box = splineBoxRef.current
    const kind = splineDrawKindRef.current
    window.removeEventListener('pointermove', handleSplineBoxMove)
    window.removeEventListener('pointerup',   handleSplineBoxUp)
    splineBoxRef.current = null
    setSplinePreview(null)
    setDragHud(null)
    if (!box || !kind) { onSplineDrawCommitRef.current?.(); return }
    const p = clientToComp(e)
    if (!p) { onSplineDrawCommitRef.current?.(); return }
    let x2 = p.x, y2 = p.y
    // A click (no real drag) → default-sized shape centered on the click.
    if (Math.abs(x2 - box.startX) < 3 && Math.abs(y2 - box.startY) < 3) {
      x2 = box.startX + 120; y2 = box.startY + 80
    }
    const spec = splineParamsFromBox(kind, { x1: box.startX, y1: box.startY, x2, y2 })
    if (!spec) { onSplineDrawCommitRef.current?.(); return }
    commitDrawnSpline(kind, spec.params, spec.centerX, spec.centerY)
  }, [clientToComp, commitDrawnSpline, handleSplineBoxMove, setDragHud])

  const handleSplineLineMove = useCallback((e: PointerEvent) => {
    const line = splineLineRef.current
    if (!line || line.points.length === 0) return
    const p = clientToComp(e)
    if (!p) return
    const pts = [...line.points, p]
    const d = 'M ' + pts.map(pt => `${pt.x} ${pt.y}`).join(' L ')
    setSplinePreview({ d, fill: false })
  }, [clientToComp])

  const finishSplineLine = useCallback((closed: boolean) => {
    const line = splineLineRef.current
    window.removeEventListener('pointermove', handleSplineLineMove)
    splineLineRef.current = null
    setSplinePreview(null)
    setDragHud(null)
    if (!line || line.points.length < 2) { onSplineDrawCommitRef.current?.(); return }
    // Center geometry on the points' bounding box; transform sits at that center.
    const xs = line.points.map(p => p.x), ys = line.points.map(p => p.y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const local = line.points.map(p => ({ x: p.x - cx, y: p.y - cy }))
    const spline = createPolylineSpline(local, closed)
    const layer = newSplineLayerFromData(spline, { name: 'Line Spline', openPath: !closed, x: cx, y: cy })
    editorRef.current!.dispatchCommand(makeAddLayerCmd(layer))
    onSelectLayer(layer.id)
    onSplineDrawCommitRef.current?.()
  }, [handleSplineLineMove, editorRef, onSelectLayer, setDragHud])

  /** Tears down any in-progress spline draw and notifies the page. */
  const cancelSplineDraw = useCallback(() => {
    splineBoxRef.current  = null
    splineLineRef.current = null
    setSplinePreview(null)
    setDragHud(null)
    window.removeEventListener('pointermove', handleSplineBoxMove)
    window.removeEventListener('pointerup',   handleSplineBoxUp)
    window.removeEventListener('pointermove', handleSplineLineMove)
  }, [handleSplineBoxMove, handleSplineBoxUp, handleSplineLineMove, setDragHud])

  // Keyboard: Enter finishes an open line, Esc cancels, Backspace removes the
  // last placed point. Active only while in spline-draw mode.
  useEffect(() => {
    if (toolMode !== 'spline-draw') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelSplineDraw()
        onSplineDrawCommitRef.current?.()
      } else if (e.key === 'Enter') {
        if (splineLineRef.current) { e.preventDefault(); finishSplineLine(false) }
      } else if (e.key === 'Backspace') {
        const line = splineLineRef.current
        if (line && line.points.length > 0) {
          e.preventDefault()
          line.points.pop()
          if (line.points.length === 0) { cancelSplineDraw(); onSplineDrawCommitRef.current?.() }
          else setSplinePreview({ d: 'M ' + line.points.map(p => `${p.x} ${p.y}`).join(' L '), fill: false })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toolMode, cancelSplineDraw, finishSplineLine])

  // Leaving draw mode mid-draw tears everything down.
  useEffect(() => {
    if (toolMode !== 'spline-draw') cancelSplineDraw()
  }, [toolMode, cancelSplineDraw])

  const onSplineDrawPointerDown = useCallback((cx: number, cy: number, pointerId: number) => {
    const kind = splineDrawKindRef.current
    if (!kind) return
    if (kind === 'line') {
      // Multi-click polyline. First click starts; later clicks add points;
      // clicking near the first point (≥2 pts) closes the path.
      const line = splineLineRef.current
      if (!line) {
        splineLineRef.current = { points: [{ x: cx, y: cy }] }
        window.addEventListener('pointermove', handleSplineLineMove)
      } else {
        const first = line.points[0]
        if (line.points.length >= 2 && Math.hypot(cx - first.x, cy - first.y) <= 8) {
          finishSplineLine(true)
        } else {
          line.points.push({ x: cx, y: cy })
        }
      }
      return
    }
    // Box-drag primitives.
    if (isBoxDragKind(kind)) {
      canvasRef.current?.setPointerCapture(pointerId)
      splineBoxRef.current = { startX: cx, startY: cy }
      window.addEventListener('pointermove', handleSplineBoxMove)
      window.addEventListener('pointerup',   handleSplineBoxUp)
    }
  }, [canvasRef, handleSplineLineMove, finishSplineLine, handleSplineBoxMove, handleSplineBoxUp])

  return { splinePreview, onSplineDrawPointerDown }
}

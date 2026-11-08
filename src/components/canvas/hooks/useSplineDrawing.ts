import {
  useCallback, useEffect, useRef, useState,
  type RefObject, type Dispatch, type SetStateAction,
} from 'react'
import type { ChronoScene } from '@/lib/types'
import type { SplinePathData, SplinePrimitiveKind, SplineGeneratorParams } from '@/lib/types/spline'
import type { OverrideMap } from '@/lib/evaluator'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import {
  splineParamsFromBox, isBoxDragKind, createPolylineSpline,
  createSplinePrimitive, splineToPathDefinition, translateSplineData, mergeSplineData,
  placeSplineInLayer,
} from '@/lib/spline'
import { newSplineLayerFromData } from '@/lib/defaults'
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
  timeMs?: number
  overrides?: OverrideMap
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
    toolMode, splineDrawKind, splineAppendTargetId, onSplineDrawCommit, timeMs = 0, overrides,
    onSelectLayer, setDragHud,
  } = opts

  // In-progress draw lives in refs (mutated without re-render); the live
  // preview svg path is mirrored to React state. Line draw: accumulated click
  // points persist across discrete clicks.
  const splineBoxRef  = useRef<{ startX: number; startY: number; pointerId: number } | null>(null)
  const splineLineRef = useRef<{ points: Array<{ x: number; y: number }> } | null>(null)
  const [splinePreview, setSplinePreview] = useState<{ d: string; fill: boolean } | null>(null)

  // Mirror props into refs so window-listener closures read fresh values.
  const splineDrawKindRef = useRef(splineDrawKind)
  useEffect(() => { splineDrawKindRef.current = splineDrawKind }, [splineDrawKind])
  const splineAppendTargetIdRef = useRef(splineAppendTargetId)
  useEffect(() => { splineAppendTargetIdRef.current = splineAppendTargetId }, [splineAppendTargetId])
  const onSplineDrawCommitRef = useRef(onSplineDrawCommit)
  useEffect(() => { onSplineDrawCommitRef.current = onSplineDrawCommit }, [onSplineDrawCommit])
  const onSelectLayerRef = useRef(onSelectLayer)
  useEffect(() => { onSelectLayerRef.current = onSelectLayer }, [onSelectLayer])
  const frameRef = useRef({ timeMs, overrides })
  frameRef.current = { timeMs, overrides }

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
  const commitDrawnData = useCallback((
    data: SplinePathData,
    centerX: number,
    centerY: number,
    openPath: boolean,
    name: string,
  ) => {
    const targetId = splineAppendTargetIdRef.current
    const target = targetId ? sceneRef.current!.layers.find(l => l.id === targetId) : null

    if (target?.type === 'spline' && target.spline) {
      // Compensate for the complete displayed transform, including groups,
      // rotation, scale and anchor, so appended geometry lands where drawn.
      const frame = frameRef.current
      const placed = placeSplineInLayer(data, centerX, centerY, target, sceneRef.current!, frame.timeMs, frame.overrides)
      if (placed) {
        const merged = mergeSplineData(target.spline, placed)
        editorRef.current!.dispatchCommand(makeUpdateLayerCmd(target.id, { spline: merged }, target))
      }
    } else {
      const base = newSplineLayerFromData(data, { name, openPath, x: centerX, y: centerY })
      editorRef.current!.dispatchCommand(makeAddLayerCmd(base))
      onSelectLayerRef.current(base.id)
    }
    onSplineDrawCommitRef.current?.()
  }, [sceneRef, editorRef])

  const commitDrawnSpline = useCallback((
    kind: SplinePrimitiveKind, params: SplineGeneratorParams, centerX: number, centerY: number,
  ) => {
    const data = createSplinePrimitive({ kind, params })
    if (!data) { onSplineDrawCommitRef.current?.(); return }
    const label = kind.charAt(0).toUpperCase() + kind.slice(1)
    commitDrawnData(data, centerX, centerY, kind === 'arc' || kind === 'line', `${label} Spline`)
  }, [commitDrawnData])

  const handleSplineBoxMove = useCallback((e: PointerEvent) => {
    const box = splineBoxRef.current
    const kind = splineDrawKindRef.current
    if (!box || !kind || e.pointerId !== box.pointerId) return
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
    if (box && e.pointerId !== box.pointerId) return
    window.removeEventListener('pointermove', handleSplineBoxMove)
    window.removeEventListener('pointerup',   handleSplineBoxUp)
    window.removeEventListener('pointercancel', handleSplineBoxUp)
    splineBoxRef.current = null
    setSplinePreview(null)
    setDragHud(null)
    if (!box || !kind || e.type === 'pointercancel') { onSplineDrawCommitRef.current?.(); return }
    const p = clientToComp(e)
    if (!p) { onSplineDrawCommitRef.current?.(); return }
    let x1 = box.startX, y1 = box.startY, x2 = p.x, y2 = p.y
    // A click (no real drag) → default-sized shape centered on the click.
    if (Math.abs(x2 - box.startX) < 3 && Math.abs(y2 - box.startY) < 3) {
      x1 = box.startX - 60; y1 = box.startY - 40
      x2 = box.startX + 60; y2 = box.startY + 40
    }
    const spec = splineParamsFromBox(kind, { x1, y1, x2, y2 })
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
    commitDrawnData(spline, cx, cy, !closed, 'Line Spline')
  }, [handleSplineLineMove, commitDrawnData, setDragHud])

  /** Tears down any in-progress spline draw and its pointer listeners. */
  const cancelSplineDraw = useCallback(() => {
    splineBoxRef.current  = null
    splineLineRef.current = null
    setSplinePreview(null)
    setDragHud(null)
    window.removeEventListener('pointermove', handleSplineBoxMove)
    window.removeEventListener('pointerup',   handleSplineBoxUp)
    window.removeEventListener('pointercancel', handleSplineBoxUp)
    window.removeEventListener('pointermove', handleSplineLineMove)
  }, [handleSplineBoxMove, handleSplineBoxUp, handleSplineLineMove, setDragHud])

  useEffect(() => () => cancelSplineDraw(), [cancelSplineDraw])

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
      splineBoxRef.current = { startX: cx, startY: cy, pointerId }
      window.addEventListener('pointermove', handleSplineBoxMove)
      window.addEventListener('pointerup',   handleSplineBoxUp)
      window.addEventListener('pointercancel', handleSplineBoxUp)
    }
  }, [canvasRef, handleSplineLineMove, finishSplineLine, handleSplineBoxMove, handleSplineBoxUp])

  return { splinePreview, onSplineDrawPointerDown }
}

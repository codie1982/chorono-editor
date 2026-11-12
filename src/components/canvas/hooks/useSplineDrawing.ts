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
  placeSplineInLayer, extendSplineContour, splineContinuation, transformSplineData,
} from '@/lib/spline'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
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
  continuationPointId?: string | null
  onWarning?: (message: string) => void
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
  /** Finish an open line or cancel the current draw; true when drawing owns right-click. */
  onSplineDrawContextMenu: () => boolean
}

/**
 * BL-73 spline drawing tools: box-drag primitives (rect / ellipse / arc / …)
 * and multi-click polyline. Owns the in-progress draw refs + the live preview
 * state, commits new contours or continues an existing open endpoint, and
 * handles Enter/right-click finish and Escape cancellation. Captured document,
 * revision, target and local time reject stale commits without replacing manual
 * edits. Temporary points/listeners belong to this hook and die on mode exit.
 */
export function useSplineDrawing(opts: UseSplineDrawingOptions): UseSplineDrawingReturn {
  const {
    canvasRef, compositionRef, sceneRef, editorRef,
    toolMode, splineDrawKind, splineAppendTargetId, onSplineDrawCommit, timeMs = 0, overrides,
    onSelectLayer, setDragHud, continuationPointId, onWarning,
  } = opts

  // In-progress draw lives in refs (mutated without re-render); the live
  // preview svg path is mirrored to React state. Line draw: accumulated click
  // points persist across discrete clicks.
  const splineBoxRef  = useRef<{ startX: number; startY: number; pointerId: number } | null>(null)
  const splineLineRef = useRef<{ points: Array<{ x: number; y: number }>; endpointId?: string; closePoint?: { x: number; y: number } } | null>(null)
  const sessionRef = useRef<{ revision: number; document: AbortSignal; targetId: string | null; timeMs: number } | null>(null)
  const warningRef = useRef(onWarning); warningRef.current = onWarning
  const targetRef = useRef(splineAppendTargetId); targetRef.current = splineAppendTargetId
  const beginSession = useCallback(() => {
    const editor = editorRef.current!
    warningRef.current?.('')
    sessionRef.current = { revision: editor.getRevision(), document: editor.getDocumentSignal(), targetId: targetRef.current ?? null, timeMs: frameRef.current.timeMs }
  }, [editorRef])
  const [splinePreview, setSplinePreview] = useState<{ d: string; fill: boolean } | null>(null)

  // Mirror props into refs so window-listener closures read fresh values.
  const splineDrawKindRef = useRef(splineDrawKind)
  useEffect(() => { splineDrawKindRef.current = splineDrawKind }, [splineDrawKind])
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
    endpointId?: string,
    closed = false,
  ) => {
    const session = sessionRef.current, editor = editorRef.current!
    if (!session || session.document.aborted || editor.getRevision() !== session.revision || editor.isTransactionActive() || frameRef.current.timeMs !== session.timeMs) {
      warningRef.current?.('Spline source or time changed. Start drawing again.'); onSplineDrawCommitRef.current?.(); return
    }
    const source = editor.getScene(), target = source.layers.find(layer => layer.id === session.targetId)
    if (session.targetId && (!target?.spline || target.locked || target.frozen || target.hidden)) {
      warningRef.current?.('The target spline is unavailable or locked.'); onSplineDrawCommitRef.current?.(); return
    }
    if (target?.type === 'spline' && target.spline) {
      // Compensate for the complete displayed transform, including groups,
      // rotation, scale and anchor, so appended geometry lands where drawn.
      const frame = frameRef.current
      const placed = placeSplineInLayer(data, centerX, centerY, target, source, frame.timeMs, frame.overrides)
      if (placed) {
        const contour = Object.values(placed.contours)[0]
        const positions = contour?.pointIds.slice(1).map(id => placed.points[id]) ?? []
        const merged = endpointId ? extendSplineContour(target.spline, endpointId, positions, closed) : mergeSplineData(target.spline, placed)
        editorRef.current!.dispatchCommand(makeUpdateLayerCmd(target.id, { spline: merged }, target))
      } else warningRef.current?.('This spline transform cannot be inverted. Nothing was changed.')
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
    const spline = createPolylineSpline(local, line.endpointId ? false : closed)
    commitDrawnData(spline, cx, cy, !closed, 'Line Spline', line.endpointId, closed)
  }, [handleSplineLineMove, commitDrawnData, setDragHud])

  /** Tears down any in-progress spline draw and its pointer listeners. */
  const cancelSplineDraw = useCallback(() => {
    sessionRef.current = null
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
      if ((e.target as Element | null)?.closest?.('input,textarea,select,[contenteditable=true],[role=menu]')) return
      if (['Escape', 'Enter', 'Backspace'].includes(e.key)) e.stopPropagation()
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
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [toolMode, cancelSplineDraw, finishSplineLine])

  // Leaving draw mode mid-draw tears everything down.
  useEffect(() => {
    if (toolMode !== 'spline-draw') cancelSplineDraw()
  }, [toolMode, cancelSplineDraw])

  const onSplineDrawPointerDown = useCallback((cx: number, cy: number, pointerId: number) => {
    const kind = splineDrawKindRef.current
    if (!kind) return
    if (!sessionRef.current) beginSession()
    if (kind === 'line') {
      // Multi-click polyline. First click starts; later clicks add points;
      // clicking near the first point (≥2 pts) closes the path.
      const line = splineLineRef.current
      if (!line) {
        splineLineRef.current = { points: [{ x: cx, y: cy }] }
        window.addEventListener('pointermove', handleSplineLineMove)
      } else {
        const first = line.closePoint ?? line.points[0]
        if (line.points.length >= 2 && Math.hypot(cx - first.x, cy - first.y) <= 8) {
          finishSplineLine(true)
        } else {
          line.points.push({ x: cx, y: cy })
          setSplinePreview({ d: 'M ' + line.points.map(point => `${point.x} ${point.y}`).join(' L '), fill: false })
        }
      }
      return
    }
    // Box-drag primitives.
    beginSession()
    if (isBoxDragKind(kind)) {
      canvasRef.current?.setPointerCapture(pointerId)
      splineBoxRef.current = { startX: cx, startY: cy, pointerId }
      window.addEventListener('pointermove', handleSplineBoxMove)
      window.addEventListener('pointerup',   handleSplineBoxUp)
      window.addEventListener('pointercancel', handleSplineBoxUp)
    }
  }, [canvasRef, handleSplineLineMove, finishSplineLine, handleSplineBoxMove, handleSplineBoxUp, beginSession])

  useEffect(() => {
    if (toolMode !== 'spline-draw' || splineDrawKind !== 'line' || !splineAppendTargetId) return
    const source = editorRef.current!.getScene(), target = source.layers.find(layer => layer.id === splineAppendTargetId)
    if (!target?.spline || target.locked || target.frozen || target.hidden) return
    const endpoint = splineContinuation(target.spline, continuationPointId)
    if (!endpoint) return
    const matrix = resolveLayerWorldMatrix(target, source, timeMs, overrides)
    if (Math.abs(matrix.determinant()) < 1e-9) return
    const world = transformSplineData(target.spline, matrix), contour = world.contours[endpoint.contourId]
    const point = world.points[endpoint.pointId]
    const closePoint = world.points[endpoint.prepend ? contour.pointIds.at(-1)! : contour.pointIds[0]]
    beginSession()
    splineLineRef.current = { points: [{ x: point.x, y: point.y }], endpointId: endpoint.pointId, closePoint }
    setSplinePreview({ d: `M ${point.x} ${point.y}`, fill: false })
    window.addEventListener('pointermove', handleSplineLineMove)
    // The gesture owns its captured source/time until commit or cancellation.
    // Frame/selection changes must not reseed an in-progress line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolMode, splineDrawKind, splineAppendTargetId])

  const onSplineDrawContextMenu = () => {
    if (toolMode !== 'spline-draw') return false
    if (splineLineRef.current) finishSplineLine(false)
    else { cancelSplineDraw(); onSplineDrawCommitRef.current?.() }
    return true
  }
  return { splinePreview, onSplineDrawPointerDown, onSplineDrawContextMenu }
}

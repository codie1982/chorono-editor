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
  createSplinePrimitive, splineToPathDefinition, translateSplineData,
  splineContinuation, transformSplineData, shouldAutoClose,
} from '@/lib/spline'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { splineDrawingCommand, type SplineDrawResult } from '@/components/splineEdit/drawing/drawingCommand'
import { useSplineBoxDrawing } from '@/components/splineEdit/drawing/useSplineBoxDrawing'
import type { PointerGestureSample } from '../interactions/PointerGestureSession'
import { pathToSvgString } from '@/lib/geometry'
import type { SnapResult } from '@/lib/snap/SnapCandidate'


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
  autoClose?: boolean
  /** Prepared shared pointer snap; anchor identity is meaningful only in the append target. */
  resolveSnap?: (point: { x: number; y: number }) => SnapResult
  onSplineDrawCommit?: (result?: SplineDrawResult) => void
  onSelectLayer: (id: string | null, shiftHeld?: boolean) => void
  setDragHud: Dispatch<SetStateAction<HudState>>
}

export interface UseSplineDrawingReturn {
  /** Live preview path (composition coords, scaled by zoom at render). */
  splinePreview: { d: string; fill: boolean } | null
  snappedPoint: { x: number; y: number } | null
  onSplineDrawHover: (event: { clientX: number; clientY: number } | null) => void
  /** Begin / continue a spline draw at a composition-space point. */
  onSplineDrawPointerDown: (cx: number, cy: number, pointerId: number) => void
  /** Finish using Auto Close, or cancel the current draw; true when drawing owns right-click. */
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
    onSelectLayer, setDragHud, continuationPointId, onWarning, autoClose = false, resolveSnap,
  } = opts

  // In-progress draw lives in refs (mutated without re-render); the live
  // preview svg path is mirrored to React state. Line draw: accumulated click
  // points persist across discrete clicks.
  const splineBoxRef  = useRef<{ startX: number; startY: number; pointerId: number } | null>(null)
  const splineLineRef = useRef<{ points: Array<{ x: number; y: number }>; endpointId?: string; closePoint?: { x: number; y: number }; existingCount?: number } | null>(null)
  const sessionRef = useRef<{ revision: number; document: AbortSignal; targetId: string | null; timeMs: number } | null>(null)
  const warningRef = useRef(onWarning); warningRef.current = onWarning
  const targetRef = useRef(splineAppendTargetId); targetRef.current = splineAppendTargetId
  const beginSession = useCallback(() => {
    const editor = editorRef.current!
    warningRef.current?.('')
    sessionRef.current = { revision: editor.getRevision(), document: editor.getDocumentSignal(), targetId: targetRef.current ?? null, timeMs: frameRef.current.timeMs }
  }, [editorRef])
  const [splinePreview, setSplinePreview] = useState<{ d: string; fill: boolean } | null>(null)
  const [snappedPoint, setSnappedPoint] = useState<{ x: number; y: number } | null>(null)

  // Mirror props into refs so window-listener closures read fresh values.
  const splineDrawKindRef = useRef(splineDrawKind)
  useEffect(() => { splineDrawKindRef.current = splineDrawKind }, [splineDrawKind])
  const onSplineDrawCommitRef = useRef(onSplineDrawCommit)
  useEffect(() => { onSplineDrawCommitRef.current = onSplineDrawCommit }, [onSplineDrawCommit])
  const onSelectLayerRef = useRef(onSelectLayer)
  useEffect(() => { onSelectLayerRef.current = onSelectLayer }, [onSelectLayer])
  const frameRef = useRef({ timeMs, overrides, autoClose, resolveSnap })
  frameRef.current = { timeMs, overrides, autoClose, resolveSnap }

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
    joinEndpointId?: string,
  ) => {
    const session = sessionRef.current, editor = editorRef.current!
    if (!session || session.document.aborted || editor.getRevision() !== session.revision || editor.isTransactionActive() || frameRef.current.timeMs !== session.timeMs) {
      warningRef.current?.('Spline source or time changed. Start drawing again.'); onSplineDrawCommitRef.current?.(); return
    }
    try {
      const prepared = splineDrawingCommand(editor.getScene(), session.targetId, data, { x: centerX, y: centerY }, openPath, name,
        session.timeMs, frameRef.current.overrides, endpointId, closed, joinEndpointId)
      if (prepared.command) editor.dispatchCommand(prepared.command)
      sessionRef.current = null
      if (!session.targetId) onSelectLayerRef.current(prepared.result.layerId)
      onSplineDrawCommitRef.current?.(prepared.result)
    } catch (error) {
      warningRef.current?.(error instanceof Error ? error.message : String(error))
      sessionRef.current = null; onSplineDrawCommitRef.current?.()
    }
  }, [sceneRef, editorRef])

  const commitDrawnSpline = useCallback((
    kind: SplinePrimitiveKind, params: SplineGeneratorParams, centerX: number, centerY: number,
  ) => {
    const data = createSplinePrimitive({ kind, params })
    if (!data) { onSplineDrawCommitRef.current?.(); return }
    const label = kind.charAt(0).toUpperCase() + kind.slice(1)
    commitDrawnData(data, centerX, centerY, kind === 'arc' || kind === 'line', `${label} Spline`)
  }, [commitDrawnData])

  const handleSplineBoxMove = useCallback((e: PointerGestureSample) => {
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

  const handleSplineBoxUp = useCallback((e: PointerGestureSample) => {
    const box = splineBoxRef.current
    const kind = splineDrawKindRef.current
    if (box && e.pointerId !== box.pointerId) return
    splineBoxRef.current = null
    setSplinePreview(null)
    setDragHud(null)
    if (!box || !kind) { onSplineDrawCommitRef.current?.(); return }
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

  /** Acquire exact world anchors through the shared engine. This is positional
   * only; topology changes require an open endpoint in the explicit edit target. */
  const acquirePoint = useCallback((point: { x: number; y: number }) => {
    const hit = frameRef.current.resolveSnap?.(point)
    setSnappedPoint(hit?.snapped ? hit.point : null)
    return { point: hit?.point ?? point, vertex: hit?.candidate?.vertex }
  }, [])

  /** Hover before the first anchor, cleared on canvas leave; no source writes. */
  const onSplineDrawHover = useCallback((event: { clientX: number; clientY: number } | null) => {
    if (!event) { setSnappedPoint(null); return }
    if (splineLineRef.current || toolMode !== 'spline-draw') return
    const point = clientToComp(event)
    if (point) acquirePoint(point)
  }, [toolMode, clientToComp, acquirePoint])

  const handleSplineLineMove = useCallback((e: PointerEvent) => {
    const line = splineLineRef.current
    if (!line || line.points.length === 0) return
    const raw = clientToComp(e)
    if (!raw) return
    if (!(e.target instanceof Node) || !canvasRef.current?.contains(e.target)) { setSnappedPoint(null); return }
    const { point: p } = acquirePoint(raw)
    const zoom = canvasRef.current!.getBoundingClientRect().width / compositionRef.current!.width
    const close = frameRef.current.autoClose && shouldAutoClose(line.points, line.closePoint ?? line.points[0], p, zoom, line.existingCount)
    const pts = [...line.points, close ? line.closePoint ?? line.points[0] : p]
    const d = 'M ' + pts.map(pt => `${pt.x} ${pt.y}`).join(' L ') + (close && !line.endpointId ? ' Z' : '')
    setSplinePreview({ d, fill: close && !line.endpointId })
  }, [clientToComp, acquirePoint])

/** Commit placed anchors only. Right-click may request closure independently
   * of cursor distance; fewer than three anchors stay open. Enter explicitly
   * requests an open line. Existing Continue routes preserve original IDs. */
  const finishSplineLine = useCallback((closed: boolean, joinEndpointId?: string) => {
    const line = splineLineRef.current
    window.removeEventListener('pointermove', handleSplineLineMove)
    splineLineRef.current = null
    setSplinePreview(null)
    setSnappedPoint(null)
    setDragHud(null)
    if (!line || line.points.length < 2 && !joinEndpointId && !(closed && line.endpointId && (line.existingCount ?? 0) >= 2)) { onSplineDrawCommitRef.current?.(); return }
    // Center geometry on the points' bounding box; transform sits at that center.
    const xs = line.points.map(p => p.x), ys = line.points.map(p => p.y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const local = line.points.map(p => ({ x: p.x - cx, y: p.y - cy }))
    closed = closed && line.points.length + (line.existingCount ?? 0) >= 3
    const spline = createPolylineSpline(local, line.endpointId ? false : closed)
    commitDrawnData(spline, cx, cy, !closed, 'Line Spline', line.endpointId, closed, joinEndpointId)
  }, [handleSplineLineMove, commitDrawnData, setDragHud])

  const boxGesture = useSplineBoxDrawing({ enabled: toolMode === 'spline-draw', element: () => canvasRef.current,
    move: handleSplineBoxMove, up: handleSplineBoxUp,
    cancel: () => { splineBoxRef.current = null; sessionRef.current = null; setSplinePreview(null); setDragHud(null) },
  })

  /** Tears down any in-progress spline draw and its pointer listeners. */
  const cancelSplineDraw = useCallback(() => {
    sessionRef.current = null
    splineBoxRef.current  = null
    splineLineRef.current = null
    setSplinePreview(null)
    setSnappedPoint(null)
    setDragHud(null)
    boxGesture.cancel()
    window.removeEventListener('pointermove', handleSplineLineMove)
  }, [handleSplineLineMove, setDragHud])

  useEffect(() => () => cancelSplineDraw(), [cancelSplineDraw])

  // Keyboard: Enter finishes an open line, Esc cancels, Backspace removes the
  // last placed point. Active only while in spline-draw mode.
  useEffect(() => {
    if (toolMode !== 'spline-draw') return
    const onKey = (e: KeyboardEvent) => {
      // A retained main viewport cannot finish/cancel drawing behind another
      // authoring surface; inert does not suppress window capture listeners.
      if (canvasRef.current?.closest('[inert]') || document.querySelector('dialog[open]')) return
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
      // Auto Close can join this contour after three anchors.
      const { point, vertex } = acquirePoint({ x: cx, y: cy })
      cx = point.x; cy = point.y
      const endpoint = vertex && vertex.layerId === targetRef.current && vertex.openEndpoint ? vertex : undefined
      const line = splineLineRef.current
      if (!line) {
        const source = editorRef.current!.getScene().layers.find(layer => layer.id === targetRef.current)?.spline
        const continuation = source && endpoint ? splineContinuation(source, endpoint.pointId) : null
        const contour = continuation && source?.contours[continuation.contourId]
        splineLineRef.current = { points: [{ x: cx, y: cy }], endpointId: continuation?.pointId,
          existingCount: contour ? contour.pointIds.length - 1 : undefined }
        window.addEventListener('pointermove', handleSplineLineMove)
      } else {
        if (endpoint && line.endpointId) {
          if (endpoint.pointId !== line.endpointId) finishSplineLine(false, endpoint.pointId)
          return // Re-clicking the starting endpoint never creates a zero-length edge.
        }
        const first = line.closePoint ?? line.points[0]
        if (frameRef.current.autoClose && shouldAutoClose(line.points, first, { x: cx, y: cy }, canvasRef.current!.getBoundingClientRect().width / compositionRef.current!.width, line.existingCount)) {
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
      splineBoxRef.current = { startX: cx, startY: cy, pointerId }
      boxGesture.start(pointerId)
    }
  }, [canvasRef, handleSplineLineMove, finishSplineLine, handleSplineBoxMove, handleSplineBoxUp, beginSession, acquirePoint, editorRef])

  // A different tool/target intent owns a fresh draft; never reinterpret an
  // in-progress box or line using the newly selected primitive or endpoint.
  useEffect(() => { cancelSplineDraw() }, [splineDrawKind, splineAppendTargetId, continuationPointId])

  useEffect(() => {
    if (toolMode !== 'spline-draw' || splineDrawKind !== 'line' || !splineAppendTargetId || !continuationPointId) return
    const source = editorRef.current!.getScene(), target = source.layers.find(layer => layer.id === splineAppendTargetId)
    if (!target?.spline || target.locked || target.frozen || target.hidden) return
    const endpoint = splineContinuation(target.spline, continuationPointId)
    if (!endpoint) { warningRef.current?.('Choose one unlocked endpoint of an open spline.'); onSplineDrawCommitRef.current?.(); return }
    const matrix = resolveLayerWorldMatrix(target, source, timeMs, overrides)
    if (Math.abs(matrix.determinant()) < 1e-9) return
    const world = transformSplineData(target.spline, matrix), contour = world.contours[endpoint.contourId]
    const point = world.points[endpoint.pointId]
    const closePoint = world.points[endpoint.prepend ? contour.pointIds.at(-1)! : contour.pointIds[0]]
    beginSession()
    splineLineRef.current = { points: [{ x: point.x, y: point.y }], endpointId: endpoint.pointId, closePoint, existingCount: contour.pointIds.length - 1 }
    setSplinePreview({ d: `M ${point.x} ${point.y}`, fill: false })
    window.addEventListener('pointermove', handleSplineLineMove)
    // The gesture owns its captured source/time until commit or cancellation.
    // Frame/selection changes must not reseed an in-progress line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolMode, splineDrawKind, splineAppendTargetId, continuationPointId])

  const onSplineDrawContextMenu = () => {
    if (toolMode !== 'spline-draw') return false
    if (splineLineRef.current) finishSplineLine(frameRef.current.autoClose)
    else { cancelSplineDraw(); onSplineDrawCommitRef.current?.() }
    return true
  }
  return { splinePreview, snappedPoint, onSplineDrawHover, onSplineDrawPointerDown, onSplineDrawContextMenu }
}

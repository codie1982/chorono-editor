'use client'
import { useRef, useState, useCallback } from 'react'
import type { ChronoScene, Keyframe } from '@/lib/types'
import {
  makeBulkMoveKfCmd, makeUpdateKfValueCmd,
} from '@/lib/editor/commands-keyframe'
import { updateKfTimeMs, updateKfValue } from '@/lib/timeline/keyframeOps'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { CurveViewport } from '@/lib/timeline/curveMath'
import { xToMs, yToValue } from '@/lib/timeline/curveMath'

export interface DragRef {
  kfId:        string
  trackTarget: string
  timelineId:  string
  startMs:     number          // original kf.timeMs
  startValue:  number          // original kf.value (numeric only)
  pointerX:    number          // pointer X at drag start (in SVG-local px)
  pointerY:    number          // pointer Y at drag start (in SVG-local px)
  /** Axis lock: 'x' = time only, 'y' = value only, null = free 2D drag */
  lockedAxis:  'x' | 'y' | null
}

interface UseCurveDragArgs {
  scene:    ChronoScene
  editor:   EditorStateReturn
  viewport: CurveViewport
  /** Stable timeline id the editor is currently focused on. */
  timelineId: string | null
  /** Maps a clientX/Y to SVG-local px (caller provides because the SVG
   *  may be translated inside the panel chrome). */
  clientToLocal: (clientX: number, clientY: number) => { x: number; y: number }
}

/**
 * Drag controller for a single keyframe node in the Curve Editor.
 *
 *  • horizontal motion → changes `kf.timeMs`   (via bulk-move command)
 *  • vertical motion   → changes `kf.value`    (via update-value command)
 *  • Shift held        → locks to the dominant axis (after the first move)
 *  • Esc               → cancels (drops the transaction)
 *
 * The actual mutation is funnelled through the existing transaction system
 * so the rest of the editor (undo/redo, keyframe inspector, value graph,
 * renderer) automatically picks up the change without any extra wiring.
 */
export function useCurveDrag({
  scene, editor, viewport, timelineId, clientToLocal,
}: UseCurveDragArgs) {
  const { beginTransaction, previewTransaction, commitTransaction, cancelTransaction } = editor
  const dragRef = useRef<DragRef | null>(null)
  /** Live preview map so the on-screen keyframe node tracks the pointer
   *  even though the underlying scene is only mutated on commit. */
  const [preview, setPreview] = useState<{ ms: number; value: number } | null>(null)

  const begin = useCallback((
    e: React.PointerEvent<SVGElement>,
    kf: Keyframe,
    trackTarget: string,
  ) => {
    if (!timelineId) return
    if (typeof kf.value !== 'number') return  // non-numeric tracks have no Y position
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)

    const { x, y } = clientToLocal(e.clientX, e.clientY)
    dragRef.current = {
      kfId:        kf.id,
      trackTarget,
      timelineId,
      startMs:     kf.timeMs,
      startValue:  kf.value,
      pointerX:    x,
      pointerY:    y,
      lockedAxis:  null,
    }
    setPreview({ ms: kf.timeMs, value: kf.value })
    beginTransaction()
  }, [timelineId, clientToLocal, beginTransaction])

  const move = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const { x, y } = clientToLocal(e.clientX, e.clientY)
    const dx = x - d.pointerX
    const dy = y - d.pointerY

    // Axis lock with Shift — choose the dominant axis once the pointer
    // has actually moved (5 px deadzone avoids flicker).
    let lock = d.lockedAxis
    if (e.shiftKey && lock == null && Math.hypot(dx, dy) > 5) {
      lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      d.lockedAxis = lock
    }
    if (!e.shiftKey) d.lockedAxis = null

    const useX = lock !== 'y'
    const useY = lock !== 'x'

    // Convert pointer position back into ms / value space.
    const nextMs    = useX ? clampMs(xToMs(viewport, x), viewport) : d.startMs
    const nextValue = useY ? yToValue(viewport, y)                  : d.startValue

    setPreview({ ms: nextMs, value: nextValue })

    // Mutate the live scene in-place via previewTransaction so the curve
    // re-samples in real time, but keep the original baseline so cancel/commit
    // can restore or finalise from the same starting point.
    let next = scene
    if (useX) next = updateKfTimeMs(next, d.timelineId, d.trackTarget, d.kfId, nextMs)
    if (useY) next = updateKfValue(next, d.timelineId, d.trackTarget, d.kfId, nextValue)
    previewTransaction(next)
  }, [scene, viewport, clientToLocal, previewTransaction])

  const end = useCallback(() => {
    const d = dragRef.current
    if (!d) return
    const p = preview
    dragRef.current = null
    setPreview(null)
    if (!p) { cancelTransaction(); return }

    const movedTime  = p.ms    !== d.startMs
    const movedValue = p.value !== d.startValue

    // Commit two separate undo entries only when both axes changed —
    // pure time-only or value-only drags are a single command.
    if (movedTime && movedValue) {
      // Bulk-move handles the time axis; update-value handles the Y axis.
      // We need the move to act on the AFTER-value scene, hence dispatching
      // value first as the committed transaction and then a follow-up cmd.
      commitTransaction(makeUpdateKfValueCmd(
        d.timelineId, d.trackTarget, d.kfId, d.startValue, p.value,
      ))
      editor.dispatchCommand(makeBulkMoveKfCmd([{
        kfId: d.kfId, target: d.trackTarget, timelineId: d.timelineId,
        fromMs: d.startMs, toMs: p.ms,
      }]))
    } else if (movedTime) {
      commitTransaction(makeBulkMoveKfCmd([{
        kfId: d.kfId, target: d.trackTarget, timelineId: d.timelineId,
        fromMs: d.startMs, toMs: p.ms,
      }]))
    } else if (movedValue) {
      commitTransaction(makeUpdateKfValueCmd(
        d.timelineId, d.trackTarget, d.kfId, d.startValue, p.value,
      ))
    } else {
      cancelTransaction()
    }
  }, [preview, editor, commitTransaction, cancelTransaction])

  const cancel = useCallback(() => {
    dragRef.current = null
    setPreview(null)
    cancelTransaction()
  }, [cancelTransaction])

  return { begin, move, end, cancel, preview, isDragging: dragRef.current != null }
}

function clampMs(ms: number, vp: CurveViewport): number {
  // Permit dragging slightly past the visible window so the user can
  // toss a keyframe outside the current zoom — but never below zero.
  return Math.max(0, ms)
}

'use client'
// ── ScaleHandlesOverlay (BL-07) ───────────────────────────────────────────────
// On-canvas drag handles for proportionally scaling a multi-keyframe
// selection's timing. Two grippers — at the selection's earliest and latest
// keyframe times — sit just below the ruler. Dragging either edge changes the
// span: the opposite end stays anchored (the pivot), and every selected kf
// is repositioned via pivot + (oldOffset × scaleFactor).
//
// Visual + commit handled here; the scaling math lives in makeScaleKeysCmd.

import { useRef, useState, useCallback } from 'react'

interface Props {
  /** Selection's earliest keyframe time (ms). */
  minMs: number
  /** Selection's latest keyframe time (ms). */
  maxMs: number
  /** Time → x pixel within the timeline scroll container. */
  msToScreenPx: (timeMs: number) => number
  /** x pixel → time (used during drag to read the cursor's new time). */
  clientXToMs: (clientX: number) => number
  /** Composition duration (clamp). */
  durationMs: number
  /** Commit the scale: pivotMs is the opposite-end anchor, factor is the
   *  multiplier applied to every kf's offset from pivot. */
  onApply: (pivotMs: number, scaleFactor: number) => void
}

const HANDLE_W = 8
const TOP = 24 // sit just under the 24px ruler

export default function ScaleHandlesOverlay({
  minMs, maxMs, msToScreenPx, clientXToMs, durationMs, onApply,
}: Props) {
  // Preview state while dragging so the handle visually follows the cursor
  // before the scaled keyframes update on release.
  const [previewMin, setPreviewMin] = useState<number | null>(null)
  const [previewMax, setPreviewMax] = useState<number | null>(null)
  const dragRef = useRef<{
    edge: 'left' | 'right'
    pivotMs: number
    origMs: number
    origSpan: number
  } | null>(null)

  const effectiveMin = previewMin ?? minMs
  const effectiveMax = previewMax ?? maxMs
  const xMin = msToScreenPx(effectiveMin)
  const xMax = msToScreenPx(effectiveMax)
  const xMid = (xMin + xMax) / 2

  const onPointerDown = useCallback((edge: 'left' | 'right') => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    const origSpan = maxMs - minMs
    // Pivot = opposite end. Right edge drag pivots on minMs and vice versa.
    const pivotMs = edge === 'right' ? minMs : maxMs
    const origMs  = edge === 'right' ? maxMs : minMs
    dragRef.current = { edge, pivotMs, origMs, origSpan }
    if (edge === 'right') setPreviewMax(origMs)
    else                  setPreviewMin(origMs)
  }, [minMs, maxMs])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const { edge, pivotMs } = dragRef.current
    const ms = Math.max(0, Math.min(durationMs, clientXToMs(e.clientX)))
    if (edge === 'right') {
      // Prevent collapsing past pivot (would invert order)
      setPreviewMax(Math.max(pivotMs + 1, ms))
    } else {
      setPreviewMin(Math.min(pivotMs - 1, ms))
    }
  }, [clientXToMs, durationMs])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const { edge, pivotMs, origMs, origSpan } = drag
    ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    const newMs = edge === 'right' ? (previewMax ?? origMs) : (previewMin ?? origMs)
    const newSpan = Math.abs(newMs - pivotMs)
    if (origSpan > 0 && Math.abs(newSpan - origSpan) > 0.5) {
      const factor = newSpan / origSpan
      onApply(pivotMs, factor)
    }
    dragRef.current = null
    setPreviewMin(null)
    setPreviewMax(null)
  }, [previewMin, previewMax, onApply])

  // Don't render if selection span is degenerate (single keyframe).
  if (maxMs <= minMs) return null

  const factor = (() => {
    const drag = dragRef.current
    if (!drag) return null
    const newSpan = edgeSpan(drag.edge, drag.pivotMs, previewMin, previewMax, drag.origMs)
    return drag.origSpan > 0 ? newSpan / drag.origSpan : null
  })()

  return (
    <>
      {/* Connecting bar between handles — visible reminder of the active span */}
      <div
        className="absolute h-1.5 bg-amber-500/30 border-y border-amber-400/40 pointer-events-none z-20"
        style={{ left: `${xMin}px`, width: `${Math.max(0, xMax - xMin)}px`, top: TOP }}
      />

      {/* Left handle */}
      <Handle
        x={xMin - HANDLE_W / 2}
        onPointerDown={onPointerDown('left')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        label="◀"
        tooltip={`Drag to scale selection · pivot = ${maxMs.toFixed(0)}ms`}
      />

      {/* Right handle */}
      <Handle
        x={xMax - HANDLE_W / 2}
        onPointerDown={onPointerDown('right')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        label="▶"
        tooltip={`Drag to scale selection · pivot = ${minMs.toFixed(0)}ms`}
      />

      {/* Live factor indicator above the midpoint when dragging */}
      {factor != null && (
        <div
          className="absolute text-[9px] font-mono text-amber-300 bg-gray-900/90 border border-amber-600 px-1 rounded pointer-events-none z-30 whitespace-nowrap"
          style={{ left: `${xMid - 24}px`, top: TOP - 14 }}
        >
          {(factor * 100).toFixed(0)}%
        </div>
      )}
    </>
  )
}

function edgeSpan(
  edge: 'left' | 'right',
  pivotMs: number,
  previewMin: number | null,
  previewMax: number | null,
  origMs: number,
): number {
  const ms = edge === 'right' ? (previewMax ?? origMs) : (previewMin ?? origMs)
  return Math.abs(ms - pivotMs)
}

function Handle({
  x, onPointerDown, onPointerMove, onPointerUp, label, tooltip,
}: {
  x: number
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp:   (e: React.PointerEvent) => void
  label: string
  tooltip: string
}) {
  return (
    <div
      className="absolute bg-amber-500 hover:bg-amber-400 border border-amber-700 text-gray-900 text-[8px] font-bold leading-none flex items-center justify-center cursor-ew-resize z-30 rounded"
      style={{ left: `${x}px`, width: `${HANDLE_W}px`, height: 14, top: TOP - 4 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title={tooltip}
    >
      {label}
    </div>
  )
}

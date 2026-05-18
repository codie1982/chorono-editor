'use client'
// ── WorkAreaOverlay (BL-11) ───────────────────────────────────────────────────
// Two draggable brackets that define a sub-range of the timeline — used by
// export and "Play work area" to limit which span is rendered. Sits inside
// the same scroll container as the ruler so it tracks zoom and pan.
//
// Default: no work area set → renders nothing. Use the toolbar button to
// initialize one covering the full duration, then drag handles in/out.

import { useCallback, useRef, useState } from 'react'

interface Props {
  /** undefined → no work area set; component renders nothing. */
  inMs:  number | undefined
  outMs: number | undefined
  durationMs: number
  msToScreenPx: (timeMs: number) => number
  clientXToMs:  (clientX: number) => number
  /** Commit a new (in, out) pair. Caller wraps in makeSetWorkAreaCmd for undo. */
  onChange: (nextIn: number, nextOut: number) => void
}

const HANDLE_W = 8
const TOP = 0 // sit on top of the ruler

export default function WorkAreaOverlay({
  inMs, outMs, durationMs, msToScreenPx, clientXToMs, onChange,
}: Props) {
  // Drag state — separate refs so the user can grab either edge independently.
  const dragRef = useRef<{ edge: 'in' | 'out'; otherMs: number } | null>(null)
  const [previewIn,  setPreviewIn]  = useState<number | null>(null)
  const [previewOut, setPreviewOut] = useState<number | null>(null)

  const effectiveIn  = previewIn  ?? inMs
  const effectiveOut = previewOut ?? outMs

  const onPointerDown = useCallback((edge: 'in' | 'out') => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (inMs == null || outMs == null) return
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    dragRef.current = { edge, otherMs: edge === 'in' ? outMs : inMs }
    if (edge === 'in') setPreviewIn(inMs)
    else               setPreviewOut(outMs)
    e.preventDefault()
    e.stopPropagation()
  }, [inMs, outMs])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const { edge, otherMs } = dragRef.current
    const ms = Math.max(0, Math.min(durationMs, clientXToMs(e.clientX)))
    if (edge === 'in') {
      // In can't pass Out; leave 1ms minimum span
      setPreviewIn(Math.min(ms, otherMs - 1))
    } else {
      setPreviewOut(Math.max(ms, otherMs + 1))
    }
  }, [clientXToMs, durationMs])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    const finalIn  = previewIn  ?? inMs
    const finalOut = previewOut ?? outMs
    if (finalIn != null && finalOut != null && (finalIn !== inMs || finalOut !== outMs)) {
      onChange(finalIn, finalOut)
    }
    dragRef.current = null
    setPreviewIn(null)
    setPreviewOut(null)
  }, [previewIn, previewOut, inMs, outMs, onChange])

  if (effectiveIn == null || effectiveOut == null) return null

  const xIn  = msToScreenPx(effectiveIn)
  const xOut = msToScreenPx(effectiveOut)
  const width = Math.max(0, xOut - xIn)

  return (
    <>
      {/* Shaded region between handles — sits above the ruler, semi-transparent
          so ticks underneath remain readable. */}
      <div
        className="absolute pointer-events-none z-10"
        style={{
          left: `${xIn}px`,
          width: `${width}px`,
          top: TOP,
          height: 24,
          background: 'linear-gradient(to bottom, rgba(56, 189, 248, 0.18), rgba(56, 189, 248, 0.08))',
          borderTop: '1px solid rgba(56, 189, 248, 0.6)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.4)',
        }}
      />

      {/* In handle — left bracket */}
      <Handle
        x={xIn - HANDLE_W}
        label="["
        tooltip={`Work area IN: ${Math.round(effectiveIn)}ms — drag to adjust`}
        onPointerDown={onPointerDown('in')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      {/* Out handle — right bracket */}
      <Handle
        x={xOut}
        label="]"
        tooltip={`Work area OUT: ${Math.round(effectiveOut)}ms — drag to adjust`}
        onPointerDown={onPointerDown('out')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </>
  )
}

function Handle({
  x, label, tooltip, onPointerDown, onPointerMove, onPointerUp,
}: {
  x: number
  label: string
  tooltip: string
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp:   (e: React.PointerEvent) => void
}) {
  return (
    <div
      className="absolute bg-sky-600 hover:bg-sky-500 border border-sky-800 text-white text-[10px] font-mono font-bold flex items-center justify-center cursor-ew-resize z-20 rounded-sm"
      style={{ left: `${x}px`, width: `${HANDLE_W}px`, height: 22, top: TOP + 1 }}
      title={tooltip}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {label}
    </div>
  )
}

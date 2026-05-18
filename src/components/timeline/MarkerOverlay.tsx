'use client'
// ── MarkerOverlay (BL-11) ─────────────────────────────────────────────────────
// Renders timeline markers as small flags above the ruler. Each marker can be
// clicked to seek the playhead, dragged horizontally to change its time, or
// right-clicked for rename / delete / color. Marker creation lives on the
// ruler itself (Cmd/Ctrl+click — see TimelineRuler.onCreateMarker).

import { useRef, useState, useCallback } from 'react'
import type { TimelineMarker } from '@/lib/types'

interface Props {
  markers: TimelineMarker[]
  msToScreenPx: (timeMs: number) => number
  clientXToMs:  (clientX: number) => number
  durationMs:   number
  /** Click marker label → jump playhead. */
  onSeek:    (timeMs: number) => void
  /** Drag commit — receives prev time and new time so the caller can build
   *  an undoable command (e.g. recreate via delete+add of moved instance). */
  onMoveMarker:   (marker: TimelineMarker, fromMs: number, toMs: number) => void
  /** Right-click → open the contextual menu (rename/color/delete). */
  onContextMenu:  (marker: TimelineMarker, e: React.MouseEvent) => void
}

/** Pixel Y of the marker flag's tip — sits inside the 24px ruler area. */
const FLAG_TOP = 0
const FLAG_HEIGHT = 18

export default function MarkerOverlay({
  markers, msToScreenPx, clientXToMs, durationMs,
  onSeek, onMoveMarker, onContextMenu,
}: Props) {
  // Per-marker drag state. Stored in a ref so the global pointermove fires
  // continuously without re-renders for the drag itself; we still
  // setState(previewMs) so the flag follows visually.
  const dragRef = useRef<{ markerId: string; fromMs: number } | null>(null)
  const [previewMs, setPreviewMs] = useState<{ markerId: string; ms: number } | null>(null)

  const onPointerDown = useCallback((marker: TimelineMarker) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    // Skip drag if a modifier is held (Cmd+drag could collide with ruler logic).
    if (e.metaKey || e.ctrlKey || e.shiftKey) return
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    dragRef.current = { markerId: marker.id, fromMs: marker.timeMs }
    setPreviewMs({ markerId: marker.id, ms: marker.timeMs })
    e.stopPropagation()
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const ms = Math.max(0, Math.min(durationMs, clientXToMs(e.clientX)))
    setPreviewMs({ markerId: dragRef.current.markerId, ms })
  }, [clientXToMs, durationMs])

  const onPointerUp = useCallback((marker: TimelineMarker) => (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    const finalMs = previewMs?.markerId === marker.id ? previewMs.ms : marker.timeMs
    if (Math.abs(finalMs - drag.fromMs) >= 1) {
      onMoveMarker(marker, drag.fromMs, finalMs)
    } else {
      // Tap (no real drag) — seek playhead. Same UX as clicking the label.
      onSeek(marker.timeMs)
    }
    dragRef.current = null
    setPreviewMs(null)
  }, [previewMs, onMoveMarker, onSeek])

  return (
    <>
      {markers.map((m) => {
        const ms = previewMs?.markerId === m.id ? previewMs.ms : m.timeMs
        const x = msToScreenPx(ms)
        const color = m.color ?? '#a78bfa'
        return (
          <div
            key={m.id}
            className="absolute select-none cursor-grab active:cursor-grabbing z-30"
            style={{
              left: `${x - 6}px`,
              top: FLAG_TOP,
              width: 12, height: FLAG_HEIGHT,
            }}
            title={`${m.label}  @ ${Math.round(ms)}ms · drag to move · right-click for options`}
            onPointerDown={onPointerDown(m)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp(m)}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(m, e) }}
          >
            {/* Vertical line down through the ruler */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full opacity-90"
              style={{ background: color }}
            />
            {/* Flag head — small triangle/rect on top */}
            <div
              className="absolute -top-px left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-sm shadow border border-black/20"
              style={{ background: color }}
            />
            {/* Label — shown on hover via group-hover, kept compact otherwise */}
            <div
              className="absolute top-0 left-3 text-[9px] font-mono whitespace-nowrap leading-tight pointer-events-none px-1 rounded-sm"
              style={{ color, background: 'rgba(17,24,39,0.85)' }}
            >
              {m.label}
            </div>
          </div>
        )
      })}
    </>
  )
}

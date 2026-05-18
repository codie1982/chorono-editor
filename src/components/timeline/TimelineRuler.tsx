'use client'
import { useMemo, useRef, useState, useCallback } from 'react'
import { computeTickIntervalMs } from '@/lib/timeline/coordinates'
import { usePlayheadScrub } from './hooks/usePlayheadScrub'

interface Props {
  durationMs: number
  currentTimeMs: number
  totalContentPx: number
  scrollLeftPx: number
  msToScreenPx: (timeMs: number) => number
  clientXToMs: (clientX: number) => number
  onSeek: (timeMs: number) => void
  /** BL-07: Shift+drag on ruler → select all keyframes in the dragged range.
   *  `addToExisting` true when Shift+Ctrl/Cmd is held (additive). */
  onRangeSelect?: (startMs: number, endMs: number, addToExisting: boolean) => void
  /** BL-11: Ctrl/Cmd+Click on ruler → drop a marker at the clicked time. */
  onCreateMarker?: (timeMs: number) => void
}

/**
 * Time ruler with adaptive tick spacing and pointer-capture scrub.
 *
 * The ruler stays fixed in viewport while the tracks scroll behind it; both
 * use the same msToScreenPx function so they stay in sync.
 *
 * Interactions:
 *   - Plain click/drag → scrub the playhead (usePlayheadScrub)
 *   - Shift+drag       → range-select keyframes (BL-07)
 */
export default function TimelineRuler(props: Props) {
  const {
    durationMs, currentTimeMs, totalContentPx, scrollLeftPx,
    msToScreenPx, clientXToMs, onSeek, onRangeSelect, onCreateMarker,
  } = props

  const scrub = usePlayheadScrub({ onSeek, clientXToMs, durationMs })

  // BL-07: range-select drag state. Active only when Shift was held on
  // pointerDown — plain drags fall through to the playhead scrub.
  const rangeStartRef = useRef<{ startMs: number; addToExisting: boolean } | null>(null)
  const [rangePreview, setRangePreview] = useState<{ startMs: number; endMs: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    // BL-11: Ctrl/Cmd+Click → drop a marker at this time. Takes priority over
    // range-select so users with both modifiers held still get the marker
    // action (more common than "shift+ctrl range select with markers").
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && onCreateMarker) {
      const ms = Math.max(0, Math.min(durationMs, clientXToMs(e.clientX)))
      onCreateMarker(ms)
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.shiftKey && onRangeSelect) {
      // Range select mode — capture pointer, suppress scrub
      ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
      const startMs = Math.max(0, Math.min(durationMs, clientXToMs(e.clientX)))
      rangeStartRef.current = { startMs, addToExisting: e.ctrlKey || e.metaKey }
      setRangePreview({ startMs, endMs: startMs })
      e.preventDefault()
      e.stopPropagation()
      return
    }
    scrub.onPointerDown(e)
  }, [clientXToMs, durationMs, onRangeSelect, onCreateMarker, scrub])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (rangeStartRef.current) {
      const endMs = Math.max(0, Math.min(durationMs, clientXToMs(e.clientX)))
      setRangePreview({ startMs: rangeStartRef.current.startMs, endMs })
      return
    }
    scrub.onPointerMove(e)
  }, [clientXToMs, durationMs, scrub])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (rangeStartRef.current) {
      const start = rangeStartRef.current
      const endMs = Math.max(0, Math.min(durationMs, clientXToMs(e.clientX)))
      const lo = Math.min(start.startMs, endMs)
      const hi = Math.max(start.startMs, endMs)
      // Only emit if the user actually dragged — bare clicks fall through
      if (Math.abs(hi - lo) >= 1 && onRangeSelect) {
        onRangeSelect(lo, hi, start.addToExisting)
      }
      rangeStartRef.current = null
      setRangePreview(null)
      ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
      return
    }
    scrub.onPointerUp(e)
  }, [clientXToMs, durationMs, onRangeSelect, scrub])

  // ── Compute visible tick positions ────────────────────────────────────────
  const ticks = useMemo(() => {
    if (durationMs <= 0 || totalContentPx <= 0) return []
    const interval = computeTickIntervalMs(totalContentPx, durationMs)
    const startMs  = Math.floor(scrollLeftPx / totalContentPx * durationMs / interval) * interval
    const endMs    = durationMs
    const out: number[] = []
    for (let ms = Math.max(0, startMs); ms <= endMs; ms += interval) {
      out.push(ms)
      if (out.length > 200) break  // safety against runaway loop
    }
    return out
  }, [durationMs, totalContentPx, scrollLeftPx])

  const playheadX = msToScreenPx(currentTimeMs)

  // BL-07: range preview rectangle pixel coords
  const rangeRect = useMemo(() => {
    if (!rangePreview) return null
    const lo = Math.min(rangePreview.startMs, rangePreview.endMs)
    const hi = Math.max(rangePreview.startMs, rangePreview.endMs)
    const xLo = msToScreenPx(lo)
    const xHi = msToScreenPx(hi)
    return { x: xLo, w: Math.max(1, xHi - xLo), lo, hi }
  }, [rangePreview, msToScreenPx])

  return (
    <div
      className="h-6 bg-gray-800 border-b border-gray-700 relative cursor-ew-resize select-none overflow-hidden"
      title={[
        'Click/drag: scrub playhead',
        onRangeSelect ? 'Shift+drag: select keyframes in range' : null,
        onCreateMarker ? 'Cmd/Ctrl+click: add marker' : null,
      ].filter(Boolean).join(' · ')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Ticks + labels */}
      {ticks.map((ms) => {
        const x = msToScreenPx(ms)
        if (x < -40 || x > totalContentPx) return null  // off-screen culling
        return (
          <div key={ms} className="absolute top-0 h-full" style={{ left: `${x}px` }}>
            <div className="w-px h-full bg-gray-600" />
            <span className="absolute bottom-0.5 left-1 text-[9px] text-gray-500 font-mono whitespace-nowrap">
              {ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${Math.round(ms)}`}
            </span>
          </div>
        )
      })}

      {/* BL-07: Range-select preview overlay */}
      {rangeRect && (
        <div
          className="absolute top-0 h-full bg-amber-400/20 border-x border-amber-400/60 pointer-events-none z-20"
          style={{ left: `${rangeRect.x}px`, width: `${rangeRect.w}px` }}
        >
          <div className="absolute -top-px left-0 right-0 text-center text-[9px] font-mono text-amber-300 whitespace-nowrap">
            {Math.round(rangeRect.lo)} – {Math.round(rangeRect.hi)}ms
          </div>
        </div>
      )}

      {/* Playhead */}
      <div
        className="absolute top-0 h-full w-0.5 bg-red-500 z-10 pointer-events-none"
        style={{ left: `${playheadX}px` }}
      />
    </div>
  )
}

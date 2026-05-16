'use client'
import { useMemo } from 'react'
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
}

/**
 * Time ruler with adaptive tick spacing and pointer-capture scrub.
 *
 * The ruler stays fixed in viewport while the tracks scroll behind it; both
 * use the same msToScreenPx function so they stay in sync.
 */
export default function TimelineRuler(props: Props) {
  const {
    durationMs, currentTimeMs, totalContentPx, scrollLeftPx,
    msToScreenPx, clientXToMs, onSeek,
  } = props

  const scrub = usePlayheadScrub({ onSeek, clientXToMs, durationMs })

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

  return (
    <div
      className="h-6 bg-gray-800 border-b border-gray-700 relative cursor-ew-resize select-none overflow-hidden"
      onPointerDown={scrub.onPointerDown}
      onPointerMove={scrub.onPointerMove}
      onPointerUp={scrub.onPointerUp}
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

      {/* Playhead */}
      <div
        className="absolute top-0 h-full w-0.5 bg-red-500 z-10 pointer-events-none"
        style={{ left: `${playheadX}px` }}
      />
    </div>
  )
}

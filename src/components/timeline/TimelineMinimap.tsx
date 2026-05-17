'use client'
import { useMemo, useRef } from 'react'
import type { Timeline } from '@/lib/types'

/**
 * Compact overview band shown beneath the layer list. Displays:
 *   - The full duration of the timeline scaled to the panel's width
 *   - A white viewport rectangle showing which range is currently visible
 *   - Aggregated keyframe density (small dots) so the user can spot where
 *     animation activity is concentrated
 *   - The playhead position as a red tick
 *
 * Click anywhere to recenter the viewport at that time.
 * Drag the viewport rect to pan.
 */
interface Props {
  durationMs:     number
  currentTimeMs:  number
  timeline:       Timeline | null
  scrollLeftPx:   number
  totalContentPx: number
  trackWidth:     number
  /** Update the main scroll position so a particular ms is centered. */
  setScrollLeftPx: (px: number) => void
  /** Optional seek on minimap click (defaults to scroll only). */
  onSeek?:        (ms: number) => void
}

const HEIGHT = 24

export default function TimelineMinimap({
  durationMs, currentTimeMs, timeline,
  scrollLeftPx, totalContentPx, trackWidth,
  setScrollLeftPx, onSeek,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startClientX: number; startScroll: number } | null>(null)

  // Density buckets — one count per ~3px so we can render a sparse strip.
  const densityBuckets = useMemo(() => {
    const buckets = 200
    const counts = new Array(buckets).fill(0) as number[]
    if (!timeline) return counts
    for (const tr of timeline.tracks) {
      for (const kf of tr.keyframes) {
        const idx = Math.floor((kf.timeMs / Math.max(1, durationMs)) * buckets)
        if (idx >= 0 && idx < buckets) counts[idx]++
      }
    }
    return counts
  }, [timeline, durationMs])

  const maxCount = Math.max(1, ...densityBuckets)

  // Viewport rect in minimap coords.
  const viewStartFrac = totalContentPx > 0 ? scrollLeftPx / totalContentPx : 0
  const viewEndFrac   = totalContentPx > 0
    ? Math.min(1, (scrollLeftPx + trackWidth) / totalContentPx)
    : 1
  const playFrac      = currentTimeMs / Math.max(1, durationMs)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !ref.current) return
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const rect = ref.current.getBoundingClientRect()
    const clickFrac = (e.clientX - rect.left) / rect.width
    const clickMs   = clickFrac * durationMs

    // Hit the viewport rect → start a pan drag. Otherwise → recenter immediately.
    const inViewport = clickFrac >= viewStartFrac && clickFrac <= viewEndFrac
    if (inViewport) {
      dragRef.current = { startClientX: e.clientX, startScroll: scrollLeftPx }
    } else {
      // Center the viewport on the clicked point.
      const newScroll = Math.max(0, Math.min(
        Math.max(0, totalContentPx - trackWidth),
        clickFrac * totalContentPx - trackWidth / 2,
      ))
      setScrollLeftPx(newScroll)
      if (onSeek) onSeek(Math.max(0, Math.min(durationMs, clickMs)))
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const pxPerMs = rect.width / Math.max(1, durationMs)
    const msPerMinipx = 1 / pxPerMs
    // Convert client delta (minimap px) to MAIN-track px via the ratio
    // (totalContentPx / minimapWidth-as-ms). Simpler: convert to ms then to track px.
    const deltaMs = (e.clientX - d.startClientX) * msPerMinipx
    const totalDurationMs = durationMs
    const deltaTrackPx = (deltaMs / totalDurationMs) * totalContentPx
    setScrollLeftPx(Math.max(0, Math.min(
      Math.max(0, totalContentPx - trackWidth),
      d.startScroll + deltaTrackPx,
    )))
  }

  const onPointerUp = () => { dragRef.current = null }

  return (
    <div className="flex border-t border-gray-800 shrink-0 bg-gray-950/70" style={{ height: HEIGHT }}>
      <div className="w-60 shrink-0 border-r border-gray-800 flex items-center px-2">
        <span className="text-[9px] uppercase tracking-wider text-gray-600 font-semibold">Mini</span>
      </div>
      <div
        ref={ref}
        className="flex-1 relative cursor-pointer select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Density dots */}
        {densityBuckets.map((c, i) => c === 0 ? null : (
          <div
            key={i}
            className="absolute bg-yellow-500/70"
            style={{
              left: `${(i / densityBuckets.length) * 100}%`,
              bottom: 2,
              width: `${100 / densityBuckets.length}%`,
              height: `${4 + (c / maxCount) * 12}px`,
              borderRadius: 1,
            }}
          />
        ))}
        {/* Viewport rect */}
        <div
          className="absolute top-0.5 bottom-0.5 border border-white/60 bg-white/10
                     pointer-events-none rounded-sm"
          style={{
            left:  `${viewStartFrac * 100}%`,
            width: `${Math.max(2, (viewEndFrac - viewStartFrac) * 100)}%`,
          }}
        />
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
          style={{ left: `${playFrac * 100}%` }}
        />
      </div>
    </div>
  )
}

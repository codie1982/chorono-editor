'use client'
import { useMemo } from 'react'
import type { Track } from '@/lib/types'
import { buildValueGraphPath, sampleTrackValueRange } from '@/lib/timeline/valueGraph'

interface Props {
  track: Track
  heightPx: number
  trackWidthPx: number
  visibleStartMs: number
  visibleEndMs: number
  msToScreenPx: (timeMs: number) => number
  /** Larger stroke + opacity when used in graph editor mode */
  emphasized?: boolean
}

/**
 * Pure presentational background graph for a single track. Re-renders only
 * when the track's keyframes or the viewport changes. Returns null for
 * non-numeric tracks or tracks with <2 keyframes — letting the parent skip
 * any visual treatment in those cases.
 */
export default function TrackValueGraph({
  track, heightPx, trackWidthPx, visibleStartMs, visibleEndMs, msToScreenPx, emphasized,
}: Props) {
  const range = useMemo(() => sampleTrackValueRange(track), [track])

  const d = useMemo(() => buildValueGraphPath({
    track,
    startMs: visibleStartMs,
    endMs:   visibleEndMs,
    widthPx: trackWidthPx,
    heightPx,
    msToScreenPx,
    range: range ?? undefined,
  }), [track, visibleStartMs, visibleEndMs, trackWidthPx, heightPx, msToScreenPx, range])

  if (!d || !range) return null

  return (
    <svg
      width="100%" height={heightPx}
      className="absolute inset-0 pointer-events-none"
      preserveAspectRatio="none"
    >
      <path
        d={d}
        fill="none"
        stroke={emphasized ? '#60A5FA' : '#3B82F6'}
        strokeWidth={emphasized ? 1.5 : 1}
        strokeOpacity={emphasized ? 0.9 : 0.4}
      />
    </svg>
  )
}

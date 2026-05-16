'use client'
import { useCallback, useRef } from 'react'

interface Params {
  onSeek: (timeMs: number) => void
  clientXToMs: (clientX: number) => number
  durationMs: number
}

interface ScrubReturn {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp:   (e: React.PointerEvent<HTMLDivElement>) => void
  /** True while the user is dragging — useful for cursor styling */
  isScrubbing: () => boolean
}

/**
 * Continuous playhead scrub via pointer capture.
 *
 * pointerDown installs a setPointerCapture so we get pointermove/up events even
 * if the cursor leaves the ruler — no jumpy "let go outside ruler" behaviour.
 */
export function usePlayheadScrub({ onSeek, clientXToMs, durationMs }: Params): ScrubReturn {
  const scrubbingRef = useRef(false)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return  // left click only
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    scrubbingRef.current = true
    const t = Math.max(0, Math.min(durationMs, clientXToMs(e.clientX)))
    onSeek(t)
  }, [clientXToMs, onSeek, durationMs])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return
    const t = Math.max(0, Math.min(durationMs, clientXToMs(e.clientX)))
    onSeek(t)
  }, [clientXToMs, onSeek, durationMs])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
  }, [])

  const isScrubbing = useCallback(() => scrubbingRef.current, [])

  return { onPointerDown, onPointerMove, onPointerUp, isScrubbing }
}

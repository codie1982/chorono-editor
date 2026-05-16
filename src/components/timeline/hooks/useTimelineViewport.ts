'use client'
import { useState, useRef, useCallback, useLayoutEffect } from 'react'
import { clientXToMs, msToPixel, pixelToMs } from '@/lib/timeline/coordinates'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

interface ViewportReturn {
  /** Ref to attach to the scrollable track area container */
  trackAreaRef: React.MutableRefObject<HTMLDivElement | null>
  zoomFactor: number
  scrollLeftPx: number
  /** Measured width of the track area in CSS pixels */
  trackWidth: number
  /** Full zoomed content width: trackWidth * zoomFactor */
  totalContentPx: number
  /** Max scroll position (totalContentPx - trackWidth, clamped to 0) */
  maxScrollPx: number
  /** Visible time range in ms */
  visibleStartMs: number
  visibleEndMs: number
  /** Wheel handler — vertical wheel zooms around cursor, shift+wheel pans */
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void
  setScrollLeftPx: (px: number) => void
  setZoomFactor: (zoom: number) => void
  /** Convert pointer clientX to a snapped/clamped timeMs */
  clientXToMs: (clientX: number) => number
  /** Convert a timeMs to a screen-relative pixel offset (subtracts scroll) */
  msToScreenPx: (timeMs: number) => number
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 20

/**
 * Viewport state for one timeline area: zoom factor + pixel scroll.
 *
 * scrollLeftPx is in pixels (not ms) so that changing zoom does NOT require
 * recomputing the offset — the cursor anchor calculation in onWheel handles it.
 */
export function useTimelineViewport(durationMs: number): ViewportReturn {
  const trackAreaRef = useRef<HTMLDivElement | null>(null)
  const [zoomFactor,   setZoomFactor]   = useState(1)
  const [scrollLeftPx, setScrollLeftPx] = useState(0)
  const [trackWidth,   setTrackWidth]   = useState(0)

  // ── Measure container width on mount + resize ────────────────────────────
  useLayoutEffect(() => {
    const el = trackAreaRef.current
    if (!el) return
    const measure = () => setTrackWidth(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Derived viewport values ──────────────────────────────────────────────
  const totalContentPx = trackWidth * zoomFactor
  const maxScrollPx    = Math.max(0, totalContentPx - trackWidth)
  const visibleStartMs = pixelToMs(scrollLeftPx,                durationMs, zoomFactor, trackWidth)
  const visibleEndMs   = pixelToMs(scrollLeftPx + trackWidth,   durationMs, zoomFactor, trackWidth)

  // ── Wheel: zoom around cursor (anchor), or pan horizontally with shift ───
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = trackAreaRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()

    // Shift+wheel = pan horizontally
    if (e.shiftKey) {
      setScrollLeftPx((s) => clamp(s + e.deltaY, 0, maxScrollPx))
      return
    }

    // Plain wheel = zoom around the cursor's time position
    const cursorOffsetInViewportPx = e.clientX - rect.left
    const cursorMs = clientXToMs(e.clientX, rect.left, scrollLeftPx, durationMs, zoomFactor, trackWidth)

    const zoomDelta = e.deltaY > 0 ? 0.85 : 1 / 0.85
    const newZoom   = clamp(zoomFactor * zoomDelta, MIN_ZOOM, MAX_ZOOM)
    if (newZoom === zoomFactor) return

    // Where the cursor's ms would land in the new zoomed coordinate system
    const newCursorPx = msToPixel(cursorMs, durationMs, newZoom, trackWidth)
    const newMaxScrollPx = Math.max(0, trackWidth * newZoom - trackWidth)
    const newScrollLeftPx = clamp(newCursorPx - cursorOffsetInViewportPx, 0, newMaxScrollPx)

    setZoomFactor(newZoom)
    setScrollLeftPx(newScrollLeftPx)
  }, [zoomFactor, scrollLeftPx, trackWidth, durationMs, maxScrollPx])

  // ── Helpers for components ────────────────────────────────────────────────
  const clientXToMsHelper = useCallback((clientX: number): number => {
    const el = trackAreaRef.current
    if (!el) return 0
    return clientXToMs(clientX, el.getBoundingClientRect().left, scrollLeftPx, durationMs, zoomFactor, trackWidth)
  }, [scrollLeftPx, durationMs, zoomFactor, trackWidth])

  const msToScreenPx = useCallback((timeMs: number): number => {
    return msToPixel(timeMs, durationMs, zoomFactor, trackWidth) - scrollLeftPx
  }, [durationMs, zoomFactor, trackWidth, scrollLeftPx])

  return {
    trackAreaRef,
    zoomFactor, scrollLeftPx, trackWidth, totalContentPx, maxScrollPx,
    visibleStartMs, visibleEndMs,
    onWheel,
    setScrollLeftPx, setZoomFactor,
    clientXToMs: clientXToMsHelper,
    msToScreenPx,
  }
}

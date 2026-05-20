'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

interface UsePlaybackReturn {
  currentTimeMs: number
  isPlaying: boolean
  playbackSpeed: number
  handlePlayToggle: () => void
  handleSeek: (ms: number) => void
  setPlaybackSpeed: (speed: number) => void
}

interface UsePlaybackOptions {
  /** Total span the playhead should cover before stopping (or wrapping). */
  maxDuration: number
  /**
   * When true, the playhead wraps back to 0 after maxDuration (timelines with
   * `loop` or `pingPong` keep cycling forever). When false the playhead
   * auto-pauses at maxDuration — matches users' expectation for one-shot
   * compositions and bounded loopCount runs.
   */
  wrapAtEnd: boolean
  /**
   * Optional work area. When both bounds are set, playback is confined to
   * [workAreaInMs, workAreaOutMs]: it starts from the IN point and either loops
   * back to it (wrapAtEnd) or pauses at the OUT point.
   */
  workAreaInMs?: number
  workAreaOutMs?: number
}

/**
 * rAF-based playback loop.
 * Uses startRef + offsetRef so seek and speed changes don't jump.
 */
export function usePlayback(opts: UsePlaybackOptions): UsePlaybackReturn {
  const { maxDuration, wrapAtEnd, workAreaInMs, workAreaOutMs } = opts

  // Effective playback window. Falls back to [0, maxDuration] when no valid
  // work area is set.
  const hasWorkArea =
    workAreaInMs != null && workAreaOutMs != null && workAreaOutMs > workAreaInMs
  const loMs = hasWorkArea ? workAreaInMs! : 0
  const hiMs = hasWorkArea ? Math.min(workAreaOutMs!, maxDuration) : maxDuration

  const [currentTimeMs, setTimeMs]   = useState(0)
  const [isPlaying, setPlaying]      = useState(false)
  const [playbackSpeed, setSpeed]    = useState(1)

  const rafRef       = useRef<number | null>(null)
  const startRef     = useRef(0)
  const offsetRef    = useRef(0)
  const speedRef     = useRef(1)

  const tick = useCallback((now: number) => {
    const elapsed = (now - startRef.current) * speedRef.current + offsetRef.current

    if (maxDuration <= 0) {
      setTimeMs(0)
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    if (elapsed >= hiMs) {
      if (wrapAtEnd) {
        const span = hiMs - loMs
        setTimeMs(span > 0 ? loMs + ((elapsed - loMs) % span) : loMs)
        rafRef.current = requestAnimationFrame(tick)
      } else {
        // Auto-pause: clamp at the end of the window, stop the loop
        setTimeMs(hiMs)
        offsetRef.current = hiMs
        setPlaying(false)
        return
      }
    } else {
      setTimeMs(elapsed)
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [maxDuration, wrapAtEnd, loMs, hiMs])

  useEffect(() => {
    if (isPlaying) {
      startRef.current = performance.now()
      rafRef.current = requestAnimationFrame(tick)
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [isPlaying, tick])

  const handlePlayToggle = useCallback(() => {
    setPlaying((playing) => {
      if (playing) {
        // Pause: freeze offset at current time
        offsetRef.current = currentTimeMs
      } else {
        // Resume: snap into the active window if the playhead is sitting
        // outside it (or parked at the end of a bounded run) so play always
        // replays from the IN point.
        if (maxDuration > 0 && (currentTimeMs < loMs || currentTimeMs >= hiMs)) {
          offsetRef.current = loMs
          setTimeMs(loMs)
        }
        startRef.current = performance.now()
      }
      return !playing
    })
  }, [currentTimeMs, maxDuration, wrapAtEnd, loMs, hiMs])

  const handleSeek = useCallback((ms: number) => {
    offsetRef.current = ms
    startRef.current  = performance.now()
    setTimeMs(ms)
  }, [])

  const setPlaybackSpeed = useCallback((speed: number) => {
    // Re-anchor so current time stays put when speed changes
    offsetRef.current = currentTimeMs
    startRef.current  = performance.now()
    speedRef.current  = speed
    setSpeed(speed)
  }, [currentTimeMs])

  return { currentTimeMs, isPlaying, playbackSpeed, handlePlayToggle, handleSeek, setPlaybackSpeed }
}

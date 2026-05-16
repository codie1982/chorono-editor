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
}

/**
 * rAF-based playback loop.
 * Uses startRef + offsetRef so seek and speed changes don't jump.
 */
export function usePlayback(opts: UsePlaybackOptions): UsePlaybackReturn {
  const { maxDuration, wrapAtEnd } = opts

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

    if (elapsed >= maxDuration) {
      if (wrapAtEnd) {
        setTimeMs(elapsed % maxDuration)
        rafRef.current = requestAnimationFrame(tick)
      } else {
        // Auto-pause: clamp at end, stop the loop
        setTimeMs(maxDuration)
        offsetRef.current = maxDuration
        setPlaying(false)
        return
      }
    } else {
      setTimeMs(elapsed)
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [maxDuration, wrapAtEnd])

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
        // Resume: if we're sitting at the end of a bounded playback, restart
        // from 0 so pressing play again replays the animation.
        if (!wrapAtEnd && currentTimeMs >= maxDuration && maxDuration > 0) {
          offsetRef.current = 0
          setTimeMs(0)
        }
        startRef.current = performance.now()
      }
      return !playing
    })
  }, [currentTimeMs, maxDuration, wrapAtEnd])

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

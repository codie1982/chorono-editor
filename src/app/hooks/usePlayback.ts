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

/**
 * rAF-based playback loop.
 * Uses startRef + offsetRef so seek and speed changes don't jump.
 */
export function usePlayback(maxDuration: number): UsePlaybackReturn {
  const [currentTimeMs, setTimeMs]   = useState(0)
  const [isPlaying, setPlaying]      = useState(false)
  const [playbackSpeed, setSpeed]    = useState(1)

  const rafRef       = useRef<number | null>(null)
  const startRef     = useRef(0)
  const offsetRef    = useRef(0)
  const speedRef     = useRef(1)

  const tick = useCallback((now: number) => {
    const elapsed = (now - startRef.current) * speedRef.current + offsetRef.current
    const t = maxDuration > 0 ? elapsed % maxDuration : 0
    setTimeMs(t)
    rafRef.current = requestAnimationFrame(tick)
  }, [maxDuration])

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
        // Resume: anchor start to now
        startRef.current = performance.now()
      }
      return !playing
    })
  }, [currentTimeMs])

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

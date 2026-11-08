'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { PlaybackClock, playbackWindow } from '@/lib/timeline/playbackClock'

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
  const window = playbackWindow(opts)
  const clock = useRef<PlaybackClock | null>(null)
  if (!clock.current) clock.current = new PlaybackClock(window)
  const [currentTimeMs, setTimeMs] = useState(clock.current.timeMs)
  const [isPlaying, setPlaying]      = useState(false)
  const [playbackSpeed, setSpeed]    = useState(1)
  const rafRef = useRef<number | null>(null)
  const publish = useCallback(() => {
    setTimeMs(clock.current!.timeMs)
    setPlaying(clock.current!.playing)
    setSpeed(clock.current!.speed)
  }, [])

  useEffect(() => {
    clock.current!.configure(window, performance.now())
    publish()
    // Scalar bounds describe the playback window independently of renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.durationMs, window.startMs, window.endMs, window.wrapAtEnd, publish])

  const tick = useCallback((now: number) => {
    rafRef.current = null
    clock.current!.sample(now)
    publish()
    if (clock.current!.playing) rafRef.current = requestAnimationFrame(tick)
  }, [publish])

  useEffect(() => {
    if (isPlaying) rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [isPlaying, tick])

  const handlePlayToggle = useCallback(() => {
    const current = clock.current!
    if (current.playing) current.pause(performance.now())
    else current.play(performance.now())
    publish()
  }, [publish])

  const handleSeek = useCallback((ms: number) => {
    clock.current!.seek(ms, performance.now())
    publish()
  }, [publish])

  const setPlaybackSpeed = useCallback((speed: number) => {
    clock.current!.setSpeed(speed, performance.now())
    publish()
  }, [publish])

  return { currentTimeMs, isPlaying, playbackSpeed, handlePlayToggle, handleSeek, setPlaybackSpeed }
}

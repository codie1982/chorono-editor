import { computeLocalTime, computeTimelineCycleEnd, hasInfinitePlayback, type TimelineCycle } from './playbackTime'

/** Explicit editor span in composition milliseconds, including a single pose.
 * Cycle settings apply within the span, independently of the global duration. */
export interface PlaybackRange {
  startMs: number
  endMs: number
  loop: boolean
  pingPong?: boolean
  loopCount?: number
}

export interface PlaybackOptions {
  maxDuration: number
  wrapAtEnd: boolean
  workAreaInMs?: number
  workAreaOutMs?: number
  /** Explicit span overrides Work Area. Undefined preserves legacy transport. */
  range?: PlaybackRange | null
}

export interface PlaybackWindow {
  durationMs: number
  startMs: number
  endMs: number
  wrapAtEnd: boolean
  rangeCycle?: TimelineCycle
}

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))

/** Normalize milliseconds without changing source. Explicit ranges may have
 * zero length; legacy invalid/empty work areas still fall back to full time. */
export function playbackWindow(options: PlaybackOptions): PlaybackWindow {
  const durationMs = Number.isFinite(options.maxDuration) ? Math.max(0, options.maxDuration) : 0
  const range = options.range
  if (range && Number.isFinite(range.startMs) && Number.isFinite(range.endMs) && range.endMs >= range.startMs) {
    const startMs = clamp(range.startMs, 0, durationMs), endMs = clamp(range.endMs, 0, durationMs)
    const rangeCycle = { durationMs: endMs - startMs, loop: range.loop, pingPong: !!range.pingPong,
      loopCount: Number.isFinite(range.loopCount) ? Math.max(0, Math.floor(range.loopCount!)) : 0 }
    return { durationMs, startMs, endMs, wrapAtEnd: hasInfinitePlayback([rangeCycle]), rangeCycle }
  }
  const valid = Number.isFinite(options.workAreaInMs) && Number.isFinite(options.workAreaOutMs)
    && options.workAreaOutMs! > options.workAreaInMs!
  const start = valid ? clamp(options.workAreaInMs!, 0, durationMs) : 0
  const end = valid ? clamp(options.workAreaOutMs!, 0, durationMs) : durationMs
  return {
    durationMs,
    startMs: end > start ? start : 0,
    endMs: end > start ? end : durationMs,
    wrapAtEnd: options.wrapAtEnd,
  }
}

/** A monotonic clock whose anchor survives React renders and window changes.
 * Explicit ranges reuse runtime cycle math; elapsed cycle phase is private and
 * distinct from the displayed local time so reverse motion/pause stay stable. */
export class PlaybackClock {
  timeMs = 0
  playing = false
  speed = 1
  private anchorAt = 0
  private anchorTimeMs = 0
  private rangeElapsedMs = 0
  private anchorRangeElapsedMs = 0
  private window: PlaybackWindow

  constructor(options: PlaybackWindow) {
    this.window = options
    this.timeMs = options.startMs
    this.anchorTimeMs = this.timeMs
  }

  sample(now: number): number {
    if (!this.playing) return this.timeMs
    const { startMs, endMs, wrapAtEnd } = this.window
    const elapsed = this.anchorTimeMs + Math.max(0, now - this.anchorAt) * this.speed
    const span = endMs - startMs
    if (this.window.rangeCycle && span > 0) {
      const cycle = this.window.rangeCycle
      this.rangeElapsedMs = this.anchorRangeElapsedMs + Math.max(0, now - this.anchorAt) * this.speed
      const limit = computeTimelineCycleEnd(cycle)
      if (!wrapAtEnd && this.rangeElapsedMs >= limit) { this.rangeElapsedMs = limit; this.playing = false }
      this.timeMs = startMs + computeLocalTime(cycle, this.rangeElapsedMs)
      return this.timeMs
    }
    if (span <= 0) {
      this.playing = false
      this.timeMs = startMs
    } else if (elapsed >= endMs) {
      this.timeMs = wrapAtEnd ? startMs + ((elapsed - startMs) % span) : endMs
      if (!wrapAtEnd) this.playing = false
    } else {
      this.timeMs = Math.max(startMs, elapsed)
    }
    return this.timeMs
  }

  configure(window: PlaybackWindow, now: number) {
    const current = this.sample(now)
    const oldSpan = this.window.endMs - this.window.startMs
    const reverse = !!this.window.rangeCycle?.pingPong && oldSpan > 0 && this.rangeElapsedMs % (oldSpan * 2) > oldSpan
    this.window = window
    this.timeMs = clamp(current, window.startMs, window.endMs)
    const offset = this.timeMs - window.startMs, span = window.endMs - window.startMs
    this.rangeElapsedMs = reverse && window.rangeCycle?.pingPong ? span * 2 - offset : offset
    this.reanchor(now)
    if (span <= 0 || (!window.rangeCycle && !window.wrapAtEnd && this.timeMs >= window.endMs)) this.playing = false
  }

  play(now: number) {
    if (this.window.endMs <= this.window.startMs) { this.timeMs = this.window.startMs; return }
    const endedRange = this.window.rangeCycle && !this.window.wrapAtEnd && this.rangeElapsedMs >= computeTimelineCycleEnd(this.window.rangeCycle)
    if (this.timeMs < this.window.startMs || this.timeMs >= this.window.endMs && !this.window.rangeCycle?.pingPong || endedRange) {
      this.timeMs = this.window.startMs; this.rangeElapsedMs = 0
    }
    this.playing = true
    this.reanchor(now)
  }

  pause(now: number) {
    this.sample(now)
    this.playing = false
    this.reanchor(now)
  }

  seek(timeMs: number, now: number) {
    if (!Number.isFinite(timeMs)) return
    const lo = this.playing ? this.window.startMs : 0
    const hi = this.playing ? this.window.endMs : this.window.durationMs
    this.timeMs = clamp(timeMs, lo, hi)
    this.rangeElapsedMs = this.timeMs - this.window.startMs
    this.reanchor(now)
  }

  setSpeed(speed: number, now: number) {
    if (!Number.isFinite(speed) || speed <= 0) return
    this.sample(now)
    this.speed = speed
    this.reanchor(now)
  }

  private reanchor(now: number) {
    this.anchorAt = now
    this.anchorTimeMs = this.timeMs
    this.anchorRangeElapsedMs = this.rangeElapsedMs
  }
}

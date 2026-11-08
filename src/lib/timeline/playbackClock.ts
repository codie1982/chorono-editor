export interface PlaybackOptions {
  maxDuration: number
  wrapAtEnd: boolean
  workAreaInMs?: number
  workAreaOutMs?: number
}

export interface PlaybackWindow {
  durationMs: number
  startMs: number
  endMs: number
  wrapAtEnd: boolean
}

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))

export function playbackWindow(options: PlaybackOptions): PlaybackWindow {
  const durationMs = Number.isFinite(options.maxDuration) ? Math.max(0, options.maxDuration) : 0
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

/** A monotonic clock whose anchor survives React renders and window changes. */
export class PlaybackClock {
  timeMs = 0
  playing = false
  speed = 1
  private anchorAt = 0
  private anchorTimeMs = 0
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
    this.window = window
    this.timeMs = clamp(current, window.startMs, window.endMs)
    this.reanchor(now)
    if (window.endMs <= window.startMs || (!window.wrapAtEnd && this.timeMs >= window.endMs)) this.playing = false
  }

  play(now: number) {
    if (this.window.endMs <= this.window.startMs) return
    if (this.timeMs < this.window.startMs || this.timeMs >= this.window.endMs) this.timeMs = this.window.startMs
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
  }
}

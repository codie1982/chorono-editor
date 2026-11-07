/** Coalesce pointer samples while always rendering the newest queued value. */
export function createLatestFrameScheduler<T>(
  render: (value: T) => void,
  schedule: (cb: FrameRequestCallback) => number = cb => requestAnimationFrame(cb),
  cancelFrame: (id: number) => void = id => cancelAnimationFrame(id),
) {
  let frame: number | null = null
  let pending: { value: T } | null = null
  const flush = () => {
    if (frame != null) cancelFrame(frame)
    frame = null
    const next = pending
    pending = null
    if (next) render(next.value)
  }
  return {
    push(value: T) {
      pending = { value }
      if (frame == null) frame = schedule(flush)
    },
    flush,
    cancel() {
      if (frame != null) cancelFrame(frame)
      frame = null
      pending = null
    },
  }
}

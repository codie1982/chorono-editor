/** Coalesce deferred host work while delivering the newest queued value.
 * One task is pending; flush consumes once, cancel discards work. Pointer edits,
 * viewport drawing and runtime signals reuse this contract with their own
 * payload ownership. Injected scheduling defers callbacks as browser RAF does. */
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

/** Minimal page-visibility dependency, injectable without a browser or React renderer. */
export interface MonitorVisibility {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

/**
 * Polls ordinary sources every 500 ms while the document is visible. A source
 * exposing subscribe instead schedules one coalesced read 500 ms after changes,
 * with no idle polling. Publishes
 * immediately on subscribe/resume, without retaining samples or resource handles.
 * The caller owns the returned idempotent unsubscribe and must call it on panel
 * unmount, inactive tab or pause. Hidden documents retain no polling timer.
 */
export function observeResourceMonitor<TSnapshot>(
  source: { getSnapshot(): TSnapshot; observe?(): () => void; subscribe?(changed: () => void): () => void },
  visibility: MonitorVisibility,
  publish: (snapshot: TSnapshot) => void,
): () => void {
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  let releaseObservation: (() => void) | undefined
  let releaseSubscription: (() => void) | undefined
  let pending: ReturnType<typeof setTimeout> | undefined

  /** Cancels the single monitor timer; never modifies the render pool's idle timer. */
  function stop(): void {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    if (pending !== undefined) clearTimeout(pending)
    pending = undefined
    releaseSubscription?.()
    releaseSubscription = undefined
    releaseObservation?.()
    releaseObservation = undefined
  }

  /** Restarts observation only on a visible document; resume always gets fresh counters. */
  function syncVisibility(): void {
    stop()
    if (disposed || visibility.hidden) return
    releaseObservation = source.observe?.()
    publish(source.getSnapshot())
    if (source.subscribe) releaseSubscription = source.subscribe(() => {
      if (disposed || visibility.hidden || pending !== undefined) return
      pending = setTimeout(() => {
        pending = undefined
        if (!disposed && !visibility.hidden) publish(source.getSnapshot())
      }, 500)
    })
    else timer = setInterval(() => publish(source.getSnapshot()), 500)
  }

  visibility.addEventListener('visibilitychange', syncVisibility)
  syncVisibility()
  return () => {
    disposed = true
    stop()
    visibility.removeEventListener('visibilitychange', syncVisibility)
  }
}

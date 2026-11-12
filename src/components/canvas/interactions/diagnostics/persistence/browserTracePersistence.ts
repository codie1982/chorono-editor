import type { InteractionTrace } from '../InteractionTrace'
import { TraceSessionStorage } from './TraceSessionStorage'

/** Create a lazy, reference-counted client bootstrap. Importing this function
 * never touches browser globals; a server render receives a harmless cleanup.
 * The always-mounted editor calls acquire in an effect, whose cleanup flushes
 * and releases ownership. Multiple consumers/StrictMode never duplicate leases. */
export function createBrowserTracePersistence(trace: InteractionTrace): () => () => void {
  let adapter: TraceSessionStorage | undefined, owners = 0
  return () => {
    if (typeof window === 'undefined') return () => {}
    if (!adapter) {
      try {
        adapter = new TraceSessionStorage(trace, { storage: window.sessionStorage, events: window,
          schedule: (callback, delay) => window.setTimeout(callback, delay),
          cancel: handle => window.clearTimeout(handle as number) })
      } catch { return () => {} }
    }
    owners++
    let released = false
    return () => {
      if (released) return
      released = true
      if (--owners === 0) { adapter?.dispose(); adapter = undefined }
    }
  }
}

/** Per-runtime correlation only, never a credential. Composition supplies the
 * boot ID so weak source-reference numbers can restart safely after a reload. */
export function createTraceBootId(): string {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID() }
  catch { /* A non-crypto fallback is sufficient for local diagnostic grouping. */ }
  return `boot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

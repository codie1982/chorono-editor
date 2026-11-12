import { applicationDiagnosticConfiguration, type DiagnosticSharingConfiguration } from '../consent/configuration'
import type { DiagnosticConsentChoice } from '../consent/DiagnosticConsentRepository'
import { BrowserDiagnosticSession } from './BrowserDiagnosticSession'
import { EMPTY_DIAGNOSTIC_SHARING, type DiagnosticSharingSnapshot } from './types'
export type { DiagnosticSharingSnapshot } from './types'

let snapshot = EMPTY_DIAGNOSTIC_SHARING
let session: BrowserDiagnosticSession | undefined
let owners = 0
const listeners = new Set<() => void>()

/** Stable UI facade; importing it performs no browser access or collection.
 * A mounted editor owns acquisition. Settings never authorize a report by
 * changing this UI snapshot; all sends re-read the durable preference. */
export const diagnosticSharing = Object.freeze({
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  setConsent(choice: Exclude<DiagnosticConsentChoice, 'unknown'>) { session?.setConsent(choice) },
  async checkVersion() { await session?.checkVersion() },
})

/** Acquire one ref-counted browser lifetime. Optional configuration exists for
 * native acceptance hosts; production supplies explicit build configuration.
 * Late callbacks from a disposed StrictMode lease cannot replace a new view. */
export function acquireDiagnosticSharing(canSend: () => boolean,
  configuration: DiagnosticSharingConfiguration | null = applicationDiagnosticConfiguration,
  clock: () => number = Date.now): () => void {
  if (typeof window === 'undefined') return () => {}
  if (!session) {
    const current = new BrowserDiagnosticSession(configuration, canSend, value => {
      if (session !== current) return
      snapshot = value
      for (const listener of Array.from(listeners)) { try { listener() } catch { /* UI observer only. */ } }
    }, clock)
    session = current; current.start()
  }
  owners++; let released = false
  return () => {
    if (released) return
    released = true
    if (--owners === 0) { const old = session; session = undefined; old?.dispose() }
  }
}

import type { DiagnosticFailureSite, DiagnosticViewportTool } from '../contracts/types'
import { diagnosticFailureAt } from '../contracts/catalog'

const listeners = new Set<(site: DiagnosticFailureSite) => void>()

/** Ephemeral code-only failure bus. It retains no history/input/exception and
 * has no sink until a consent owner subscribes. Observer failure cannot change
 * the editor's commit/cancel cleanup or trigger recursive reporting. */
export function reportDiagnosticFailure(site: DiagnosticFailureSite): void {
  if (!diagnosticFailureAt(site)) return
  for (const listener of Array.from(listeners)) { try { listener(site) } catch { /* Optional observer. */ } }
}

/** Borrow live failure signals only; subscribing never replays local history. */
export function subscribeDiagnosticFailures(listener: (site: DiagnosticFailureSite) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Map only known gesture owners and real preview/commit exceptions. Ordinary
 * source/native cancellations do not enter this path. No arbitrary owner text
 * or Error reaches the listener. */
export function reportViewportFailure(owner: string | undefined, phase: 'preview' | 'commit'): void {
  const tools: readonly DiagnosticViewportTool[] = ['object-move', 'object-rotate', 'object-scale',
    'object-anchor', 'object-resize', 'guide', 'shape-placement', 'motion-key']
  const tool = tools.find(value => value === owner)
  if (tool) reportDiagnosticFailure(`viewport.${tool}.${phase}`)
}

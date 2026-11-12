import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { acquireDiagnosticSharing, diagnosticSharing } from '@/lib/diagnostics/browser/sharing'
import { reportDiagnosticFailure } from '@/lib/diagnostics/browser/failureSignals'
import { createDiagnosticConfiguration } from '@/lib/diagnostics/consent/configuration'
import { DIAGNOSTIC_CONSENT_KEY } from '@/lib/diagnostics/consent/DiagnosticConsentRepository'
import { DiagnosticConsentPrompt } from '../DiagnosticConsentPrompt'
import { DiagnosticSharingSection } from '../DiagnosticSharingSection'

const configuration = createDiagnosticConfiguration('http://127.0.0.1:2000/api/diagnostics/reports', 'Local QA receiver')

/** Isolated native acceptance host for real consent/storage/outbox components.
 * Serve on the dedicated QA origin (4346), separate from the user's editor
 * preference/storage. This fixture never grants permission or emits a failure
 * automatically. Each test occurrence is an explicit, code-only button action;
 * the configured loopback receiver is the real production API implementation.
 */
function DiagnosticSharingAcceptance() {
  const [signals, setSignals] = useState(0)
  const clockOffset = useRef(0)
  const snapshot = useSyncExternalStore(diagnosticSharing.subscribe, diagnosticSharing.getSnapshot, diagnosticSharing.getSnapshot)
  useEffect(() => acquireDiagnosticSharing(() => true, configuration, () => Date.now() + clockOffset.current), [])
  return <main style={{ maxWidth: 760, margin: '32px auto', padding: 24, background: '#111827', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 12 }}>
    <h1>Diagnostic sharing acceptance</h1>
    <p>Real persistent consent and delivery to the loopback receiver. This isolated origin contains no user scene.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '24px 0' }}>
      <button type="button" style={{ minHeight: 44, padding: '8px 14px' }} onClick={() => {
        reportDiagnosticFailure('viewport.object-move.commit'); setSignals(value => value + 1)
      }}>Record test failure</button>
      <button type="button" style={{ minHeight: 44, padding: '8px 14px' }} onClick={() => {
        clockOffset.current += 300000; window.dispatchEvent(new Event('online'))
      }}>Advance QA clock five minutes</button>
      <button type="button" style={{ minHeight: 44, padding: '8px 14px' }} onClick={() => {
        localStorage.removeItem(DIAGNOSTIC_CONSENT_KEY); location.reload()
      }}>Reset QA preference</button>
    </div>
    <p aria-label="QA signals">Explicit test signals: {signals}</p>
    <DiagnosticSharingSection />
    <details style={{ marginTop: 24 }} open>
      <summary>Read-only runtime state</summary>
      <pre id="diagnostic-sharing-state" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(snapshot, null, 2)}</pre>
    </details>
    <DiagnosticConsentPrompt />
  </main>
}

document.body.style.margin = '0'
document.body.style.background = '#030712'
document.body.style.font = '14px system-ui'
createRoot(document.getElementById('app')!).render(<DiagnosticSharingAcceptance />)

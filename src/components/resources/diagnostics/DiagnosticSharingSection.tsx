'use client'
import { useSyncExternalStore } from 'react'
import { diagnosticSharing, type DiagnosticSharingSnapshot } from '@/lib/diagnostics/browser/sharing'
import { applicationBuildInfo } from '@/lib/version'
import { DiagnosticSharingDisclosure } from './DiagnosticSharingDisclosure'
import styles from './DiagnosticSharing.module.css'

/** Map internal result categories to short UI text. Unknown categories do not
 * echo exception messages or arbitrary transport/server text into this panel. */
function outcomeLabel(outcome: string): string {
  if (outcome === 'sent') return 'Sent'
  if (outcome === 'retrying') return 'Waiting to retry'
  if (outcome === 'failed') return 'Could not send'
  if (outcome === 'offline') return 'Offline'
  return 'Waiting'
}

/** Pure compact preference/status view. The checkbox is a deliberate decision,
 * never a prefilled first-run permission; missing storage/outbox/config disables
 * sharing. Version checks share the disclosed consent and cannot bypass it. */
export function DiagnosticSharingView({ snapshot, onConsent, onCheckVersion }: {
  snapshot: DiagnosticSharingSnapshot
  onConsent: (choice: 'allowed' | 'denied') => void
  onCheckVersion: () => void
}) {
  const available = snapshot.ready && snapshot.configured && snapshot.storageAvailable && snapshot.queueAvailable
  const canChangePreference = snapshot.ready && snapshot.configured && snapshot.storageAvailable
  const preferenceAllowed = snapshot.choice === 'allowed'
  const allowed = available && preferenceAllowed, configuration = snapshot.configuration
  return <section className={styles.section} aria-label="Diagnostic sharing">
    <h3 className={styles.heading}>Error sharing & updates</h3>
    <label className={styles.toggle}>
      <input type="checkbox" checked={canChangePreference && preferenceAllowed}
        disabled={!canChangePreference || (!snapshot.queueAvailable && !preferenceAllowed)} aria-describedby="diagnostic-sharing-scope"
        onChange={event => onConsent(event.target.checked ? 'allowed' : 'denied')} />
      <span>Share error reports and check for updates</span>
    </label>
    <p id="diagnostic-sharing-scope" className={styles.muted}>Short anonymous summaries only. Detailed Interaction recordings stay local.</p>
    {!snapshot.ready ? <p role="status">Loading your preference…</p>
      : !snapshot.configured ? <p className={styles.muted}>Sharing is not configured. No data is sent.</p>
        : !snapshot.storageAvailable ? <p role="status">Sharing is off because this browser cannot save your preference.</p>
          : !snapshot.queueAvailable ? <p role="status">{preferenceAllowed
            ? 'Sending is paused because a safe background queue is unavailable. You can turn sharing off.'
            : 'Sharing is off because a safe background queue is unavailable.'}</p>
            : <p role="status">{allowed ? 'Sharing is on. You can turn it off at any time.' : 'Sharing is off. Your choice is remembered.'}</p>}
    {configuration && <p className={styles.muted}>{configuration.operator}<span className={styles.destination}>{configuration.endpoint}</span></p>}
    {configuration && <DiagnosticSharingDisclosure />}
    {allowed && <dl className={styles.metrics}>
      <div><dt>Queued</dt><dd>{snapshot.queued}</dd></div>
      <div><dt>Dropped</dt><dd>{snapshot.dropped}</dd></div>
      <div><dt>Delivery</dt><dd>{outcomeLabel(snapshot.lastOutcome)}</dd></div>
    </dl>}
    <div className={styles.version}>
      <p>Installed version <strong>{applicationBuildInfo.appVersion}</strong></p>
      {snapshot.versionStatus === 'available' && snapshot.latestVersion && <p role="status">Version {snapshot.latestVersion} is available.</p>}
      {snapshot.versionStatus === 'current' && <p role="status">You have the latest version.</p>}
      {snapshot.versionStatus === 'failed' && <p role="status">Could not check for updates.</p>}
      {snapshot.versionStatus === 'available' && snapshot.notesUrl && <p><a href={snapshot.notesUrl} target="_blank" rel="noopener noreferrer">Release notes</a></p>}
      <button type="button" className={styles.action} disabled={!allowed || snapshot.versionStatus === 'checking'}
        onClick={onCheckVersion}>{snapshot.versionStatus === 'checking' ? 'Checking…' : 'Check now'}</button>
    </div>
  </section>
}

/** Live Resources leaf; subscribes only to immutable sharing-state changes.
 * Opening/closing this view neither starts collection nor changes permission. */
export function DiagnosticSharingSection() {
  const snapshot = useSyncExternalStore(diagnosticSharing.subscribe, diagnosticSharing.getSnapshot, diagnosticSharing.getSnapshot)
  return <DiagnosticSharingView snapshot={snapshot} onConsent={diagnosticSharing.setConsent}
    onCheckVersion={() => { void diagnosticSharing.checkVersion() }} />
}

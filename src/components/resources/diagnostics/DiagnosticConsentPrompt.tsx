'use client'
import { useEffect, useRef, useSyncExternalStore, type Ref } from 'react'
import { diagnosticSharing, type DiagnosticSharingSnapshot } from '@/lib/diagnostics/browser/sharing'
import { DiagnosticSharingDisclosure } from './DiagnosticSharingDisclosure'
import styles from './DiagnosticSharing.module.css'

type Decision = Exclude<DiagnosticSharingSnapshot['choice'], 'unknown'>

/** The question is eligible only after durable preference/outbox readiness.
 * Unknown is never permission; missing deployment config suppresses the prompt.
 * Persisted decisions and unsupported storage/locking cannot prompt on each open. */
export function shouldShowDiagnosticPrompt(snapshot: DiagnosticSharingSnapshot, visible = true): boolean {
  return visible && snapshot.ready && snapshot.configured && snapshot.storageAvailable &&
    snapshot.queueAvailable && snapshot.configuration !== null && snapshot.choice === 'unknown'
}

/** Presentational question shared by the native dialog and server-render tests.
 * It owns no preference/state; callbacks represent deliberate user decisions.
 * The receiver and retention copy matches the first-release deployment contract. */
export function DiagnosticConsentContent({ snapshot, onChoose, declineRef }: {
  snapshot: DiagnosticSharingSnapshot
  onChoose: (choice: Decision) => void
  declineRef?: Ref<HTMLButtonElement>
}) {
  const configuration = snapshot.configuration
  if (!configuration) return null
  return <>
    <div className={styles.header}>
      <h2 id="diagnostic-sharing-title" className={styles.title}>Help improve Chorono</h2>
      <button type="button" className={styles.close} aria-label="Close diagnostic sharing question"
        onClick={() => onChoose('dismissed')}>×</button>
    </div>
    <p id="diagnostic-sharing-description">Allow anonymous error summaries and update checks?</p>
    <p className={styles.muted}>Only the app version, error codes and repeat counts are shared. Your project and artwork are not included.</p>
    <p>Send to <strong>{configuration.operator}</strong><span className={styles.destination}>{configuration.endpoint}</span></p>
    <p className={styles.muted}>Your choice is remembered. You can change it in Resources → Interaction.</p>
    <DiagnosticSharingDisclosure />
    <div className={styles.actions}>
      <button ref={declineRef} type="button" className={styles.action} onClick={() => onChoose('denied')}>Don't send</button>
      <button type="button" className={`${styles.action} ${styles.allow}`} onClick={() => onChoose('allowed')}>Allow</button>
    </div>
  </>
}

/** One native modal on first eligible editor entry. Native dialog supplies focus
 * trapping/inert background; the safe decline action receives initial focus.
 * Escape and the explicit close action persist dismissed rather than allowing.
 * Cleanup closes only this modal; it does not manufacture a consent decision.
 * Visibility lets the owner finish its welcome flow before asking the question. */
export function DiagnosticConsentPrompt({ visible = true }: { visible?: boolean }) {
  const snapshot = useSyncExternalStore(diagnosticSharing.subscribe, diagnosticSharing.getSnapshot, diagnosticSharing.getSnapshot)
  const dialog = useRef<HTMLDialogElement>(null), decline = useRef<HTMLButtonElement>(null)
  const show = shouldShowDiagnosticPrompt(snapshot, visible)
  useEffect(() => {
    const element = dialog.current
    if (!show || !element) return
    if (!element.open) element.showModal()
    decline.current?.focus()
    return () => { if (element.open) element.close() }
  }, [show])
  if (!show) return null
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="diagnostic-sharing-title"
    aria-describedby="diagnostic-sharing-description" onKeyDown={event => event.stopPropagation()}
    onCancel={event => { event.preventDefault(); diagnosticSharing.setConsent('dismissed') }}>
    <DiagnosticConsentContent snapshot={snapshot} onChoose={diagnosticSharing.setConsent} declineRef={decline} />
  </dialog>
}

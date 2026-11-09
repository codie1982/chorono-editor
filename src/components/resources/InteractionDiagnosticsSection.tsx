'use client'
import { useState, useSyncExternalStore } from 'react'
import { interactionTrace } from '@/components/canvas/interactions/diagnostics'
import { downloadOutput, editorOutputResources } from '@/lib/export/resources'
import { utf8ByteLength } from '@/lib/format/json'
import { MetricList } from './MetricList'
import styles from './ResourceMonitorPanel.module.css'

const subscribe = (listener: () => void) => interactionTrace.subscribe(listener)
const getSnapshot = () => interactionTrace.getSnapshot()
const terminalEvents = new Set(['source-commit', 'source-cancel', 'current-rejected', 'native-cancel', 'native-up'])

/** Optional local gesture diagnostics controls. Recording belongs to the shared
 * bounded trace, so it continues when this dock is closed and stops only when
 * requested. This view subscribes to changes without polling and never edits
 * scene/history. It displays only the latest terminal result; exported JSON
 * retains the bounded correlated lifecycle records for investigation. */
export function InteractionDiagnosticsSection() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [error, setError] = useState('')
  const terminal = [...snapshot.records].reverse().find(record => terminalEvents.has(record.event))
  const outcome = terminal
    ? `${terminal.owner} · ${terminal.event}${terminal.details.reason ? ` · ${terminal.details.reason}` : ''}`
    : 'No completed gesture recorded'

  /** Download the current bounded trace using the existing output and source-URL
   * owners. The download retains its own finite handoff pin; this component drops
   * its Blob lease even on failure. Logs stay local and source data is unchanged. */
  function download(): void {
    setError('')
    try {
      const json = interactionTrace.exportJson()
      const blob = editorOutputResources.own(Math.max(1, utf8ByteLength(json)),
        () => new Blob([json], { type: 'application/json' }), () => {})
      try { downloadOutput(blob, value => value, 'chorono-interaction-diagnostics.json') }
      finally { blob.release() }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The diagnostic log could not be downloaded.')
    }
  }

  return <section aria-label="Interaction diagnostics">
    <div className={styles.scope}>
      <h3>Interaction diagnostics <span className={styles.badge}>{snapshot.enabled ? 'Recording' : 'Stopped'}</span></h3>
      <p>Record object transforms, guide moves, motion keys, shape drawing, and Pan to investigate a cancelled or reverted drag.</p>
      <p>Off by default. Records stay in this browser tab; full scene data and media are excluded. Recording continues when this panel is closed.</p>
    </div>
    <div className={styles.pagination} role="group" aria-label="Interaction diagnostic controls">
      <button type="button" aria-pressed={snapshot.enabled}
        onClick={() => interactionTrace.setEnabled(!snapshot.enabled)}>{snapshot.enabled ? 'Stop recording' : 'Start recording'}</button>
      <button type="button" disabled={snapshot.records.length === 0} onClick={() => interactionTrace.clear()}>Clear log</button>
      <button type="button" disabled={snapshot.records.length === 0} onClick={download}>Download JSON</button>
    </div>
    <MetricList rows={[
      ['Recorded events / limit', `${snapshot.records.length} / ${snapshot.capacity}`],
      ['Older events replaced', snapshot.dropped],
      ['Last outcome', outcome],
    ]} />
    <p>Start recording, reproduce the first-drag problem, then stop recording and download the log. A successful release does not rule out an intermittent failure.</p>
    {error && <p role="alert">{error}</p>}
  </section>
}

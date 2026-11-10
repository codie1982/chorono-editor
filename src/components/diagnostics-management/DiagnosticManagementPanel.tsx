'use client'
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { DiagnosticManagementApi } from './DiagnosticManagementApi'
import { DiagnosticManagementController } from './DiagnosticManagementController'
import { DiagnosticManagementView } from './DiagnosticManagementView'

/** Compose one mounted, memory-only administrator session. No request begins
 * during SSR/import/mount. Cleanup forgets the token and cancels pending work;
 * React StrictMode may mount the same passive controller again safely. */
export function DiagnosticManagementPanel() {
  const controller = useMemo(() => new DiagnosticManagementController(new DiagnosticManagementApi(
    (url, init) => fetch(url, init), () => window.location.origin)), [])
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  useEffect(() => () => controller.disconnect(), [controller])
  return <DiagnosticManagementView snapshot={snapshot} onConnect={token => { void controller.connect(token) }}
    onDisconnect={() => controller.disconnect()} onRefresh={() => { void controller.refresh() }}
    onQuery={query => { void controller.setQuery(query) }} onStatus={(key, status) => { void controller.changeStatus(key, status) }} />
}

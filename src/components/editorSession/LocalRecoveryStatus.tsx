import type { RecoveryStatus } from '@/lib/editor/persistence/recovery/SceneSessionRecovery'

/** Compact, truthful local save status. A recoverable journal is local storage,
 * not a downloaded project or server backup. Errors remain visible with retry. */
export function LocalRecoveryStatus({ status }: { status: RecoveryStatus & { retry(): void } }) {
  const label = status.state === 'saved' ? 'Saved locally' : status.state === 'error' ? 'Local save failed'
    : status.state === 'idle' ? 'Local recovery ready' : 'Saving locally…'
  return <span role={status.state === 'error' ? 'alert' : 'status'} aria-label="Local recovery" title={status.error ?? 'This browser keeps your last committed scene for reload recovery. Save Scene JSON for a portable backup.'}
    className={`shrink-0 flex items-center gap-1 text-[10px] ${status.state === 'error' ? 'text-amber-300' : 'text-gray-400'}`}>
    <span aria-hidden="true" className={status.state === 'saved' ? 'text-emerald-400' : ''}>●</span>{label}
    {status.state === 'error' && <button className="underline focus-visible:outline" onClick={status.retry}>Retry</button>}
  </span>
}

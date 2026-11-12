import type { RecoveryStatus } from '@/lib/editor/persistence/recovery/SceneSessionRecovery'
import type { HistoryState } from '@/lib/editor/history'
import type { HistoryBudgetResult } from '@/lib/editor/history/historyBudget'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'

/** Compact, truthful local save status. A recoverable journal is local storage,
 * not a downloaded project or server backup. Errors remain visible with retry.
 * Help sits outside the live region and opens the recovery guide without saving. */
export function LocalRecoveryStatus({ status, sessionId, history, budget }: { status: RecoveryStatus & { retry(): void };sessionId?:string;history?:HistoryState;budget?:Omit<HistoryBudgetResult,'history'> }) {
  const label = status.state === 'saved' ? 'Saved locally' : status.state === 'error' ? 'Local save failed'
    : status.state === 'idle' ? 'Local recovery ready' : 'Saving locally…'
  const details=history?`Session: ${sessionId}\nUndo: ${history.past.length} · Redo: ${history.future.length}\nHistory source estimate: ${((budget?.estimatedBytes??0)/1024**2).toFixed(1)} MiB / 64 MiB${budget?.droppedSteps?` · ${budget.droppedSteps} distant steps discarded`:''}`:''
  return <span className="shrink-0 flex items-center gap-1"><span role={status.state === 'error' ? 'alert' : 'status'} aria-label="Local recovery" title={[status.error??'Reload restores the current source and bounded Undo/Redo.',details].filter(Boolean).join('\n')}
    className={`shrink-0 flex items-center gap-1 text-[10px] ${status.state === 'error' ? 'text-amber-300' : 'text-gray-400'}`}>
    <span aria-hidden="true" className={status.state === 'saved' ? 'text-emerald-400' : ''}>●</span>{label}
    {status.state === 'error' && <button className="underline focus-visible:outline" onClick={status.retry}>Retry</button>}
  </span><DocumentationHelp topic="editor/projects#automatic-local-recovery" compact /></span>
}

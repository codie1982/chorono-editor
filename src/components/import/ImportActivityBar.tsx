import type { ImportProgress } from '@/lib/import/types'

/** Accessible current-document import feedback; cancelled native settlement is
 * shown separately. This component owns no jobs, timers or progress polling. */
export function ImportActivityBar({ activeCount, settlingCount, label, progress, onCancel }: {
  activeCount: number; settlingCount: number; label: string | null; progress: ImportProgress | null; onCancel: () => void
}) {
  if (!activeCount && !settlingCount) return null
  return <aside aria-label="Import activity" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200">
    <div role="status" aria-live="polite" className="min-w-0 flex-1">
      {activeCount ? <><strong>Importing {activeCount > 1 ? `${activeCount} items` : label}</strong><span className="ml-2">{progress?.stage === 'complete' ? 'Finalizing import…' : progress?.label ?? 'Waiting to start…'}</span></>
        : <strong>Finishing cancelled work…</strong>}
      {settlingCount > 0 && <span className="ml-2 text-gray-300">{settlingCount} cancelled {settlingCount === 1 ? 'request' : 'requests'} settling</span>}
    </div>
    {activeCount > 0 && <button type="button" onClick={onCancel}
      className="min-h-11 rounded border border-gray-600 px-3 text-gray-100 hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">Cancel imports</button>}
  </aside>
}

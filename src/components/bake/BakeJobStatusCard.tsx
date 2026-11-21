import type { ReactNode } from 'react'
import type { BakeJobProgress, BakeJobStatus } from '@/lib/bake'

interface BakeJobStatusView {
  readonly label: string
  readonly status: BakeJobStatus
  readonly progress: BakeJobProgress
  readonly error?: string
}

interface BakeJobStatusCardProps {
  readonly snapshot: BakeJobStatusView
  readonly sourceLabel?: string
  readonly rangeLabel?: string
  readonly qualityLabel?: string
  /** Disable the card-level live region when a parent queue announces a single
   * aggregate update. Visual status text remains unchanged. */
  readonly announce?: boolean
  readonly children?: ReactNode
}

/**
 * Presents one BakeService snapshot with the same status/progress language in
 * feature panels and the shared Jobs & Bake dock. It is deliberately
 * side-effect free: the owning panel supplies context-specific actions and
 * result details. Status remains readable without colour and errors reserve
 * inline space instead of relying on a transient toast.
 */
export function BakeJobStatusCard({
  snapshot,
  sourceLabel,
  rangeLabel,
  qualityLabel,
  announce = true,
  children,
}: BakeJobStatusCardProps) {
  const percentage = Math.round(snapshot.progress.value * 100)
  const active = snapshot.status === 'queued' || snapshot.status === 'running' || snapshot.status === 'committing'
  return <section aria-label="Bake job status" className="rounded border border-gray-700 bg-gray-950/65 p-3 text-xs">
    <div role={announce ? 'status' : undefined} aria-atomic={announce ? 'true' : undefined}
      className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-gray-100">{snapshot.label}</p>
        <p className="mt-0.5 text-[11px] text-gray-400">{statusLabel(snapshot.status)}</p>
      </div>
      <span className="shrink-0 rounded bg-gray-800 px-2 py-0.5 font-mono text-[10px] tabular-nums text-gray-300">
        {percentage}%
      </span>
    </div>
    {(sourceLabel || rangeLabel || qualityLabel) && <dl className="mt-2 grid gap-1 text-[10px] text-gray-400">
      {sourceLabel && <div className="flex gap-1"><dt className="text-gray-500">Source:</dt><dd className="truncate text-gray-300">{sourceLabel}</dd></div>}
      {rangeLabel && <div className="flex gap-1"><dt className="text-gray-500">Range:</dt><dd className="text-gray-300">{rangeLabel}</dd></div>}
      {qualityLabel && <div className="flex gap-1"><dt className="text-gray-500">Quality:</dt><dd className="text-gray-300">{qualityLabel}</dd></div>}
    </dl>}
    <p className="mt-2 min-h-4 text-[10px] leading-4 text-gray-400">{snapshot.progress.message}</p>
    {active && <div role="progressbar" aria-label="Bake progress" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={percentage} className="mt-2 h-1.5 overflow-hidden rounded bg-gray-800">
      <div className="h-full bg-blue-500 transition-[width] duration-150" style={{ width: `${percentage}%` }} />
    </div>}
    {snapshot.status === 'stale' && <p className="mt-2 rounded border border-amber-700/70 bg-amber-950/30 px-2 py-1.5 text-amber-200">
      Stale preview — the source changed. Discard it and prepare a new simulation.
    </p>}
    {snapshot.error && <p role="alert" className="mt-2 rounded border border-red-800/70 bg-red-950/30 px-2 py-1.5 text-red-200">
      {snapshot.error}
    </p>}
    {children && <div className="mt-3 border-t border-gray-800 pt-3">{children}</div>}
  </section>
}

/** Human-readable state text shared by every bake surface. */
export function statusLabel(status: BakeJobStatus): string {
  switch (status) {
    case 'idle': return 'Ready'
    case 'queued': return 'Queued'
    case 'running': return 'Preparing preview'
    case 'preview-ready': return 'Preview ready'
    case 'committing': return 'Applying bake'
    case 'completed': return 'Bake completed'
    case 'cancelled': return 'Bake cancelled'
    case 'stale': return 'Source changed'
    case 'failed': return 'Bake failed'
  }
}

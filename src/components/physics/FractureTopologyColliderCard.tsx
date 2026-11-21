import type { FractureRenderColliderAnalysis } from '@/lib/fracture/FractureRenderColliderAnalyzer'

interface Props {
  readonly analysis: FractureRenderColliderAnalysis
}

/**
 * Summarizes the atomic topology transition and exact render/collider delta.
 *
 * Status is always written as text, metrics use tabular figures and failure
 * states include a local recovery action. The component is presentation-only;
 * geometry evaluation and ownership remain in the fracture domain.
 */
export default function FractureTopologyColliderCard({ analysis }: Props) {
  if (analysis.status === 'unavailable') {
    return <section aria-label="Fracture topology and collider quality"
      className="mt-3 rounded-md border border-amber-800/70 bg-amber-950/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-xs font-semibold text-gray-100">Topology &amp; collider</h5>
        <StatusBadge label="Unavailable" tone="warning" />
      </div>
      <p className="mt-2 text-xs leading-5 text-amber-200">{analysis.reason}</p>
      <p className="mt-1 text-xs leading-5 text-gray-400">
        Restore the generated layers or Re-bake, then inspect the exact event frame again.
      </p>
    </section>
  }

  const aligned = analysis.status === 'pass'
  return <section aria-label="Fracture topology and collider quality"
    className={`mt-3 rounded-md border p-3 ${aligned
      ? 'border-sky-900/70 bg-sky-950/10'
      : 'border-amber-800/70 bg-amber-950/20'}`}>
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="min-w-0">
        <h5 className="text-xs font-semibold text-gray-100">Topology &amp; collider</h5>
        <p className="mt-1 text-xs leading-5 text-gray-400">
          Atomic event · {formatNumber(analysis.eventTimeMs, 3)} ms · tick {analysis.eventTick}
        </p>
      </div>
      <StatusBadge label={aligned ? 'Collider aligned' : 'Review collider'} tone={aligned ? 'good' : 'warning'} />
    </div>

    {!aligned && <p className="mt-2 rounded border border-amber-800/60 bg-amber-950/30 p-2 text-xs leading-5 text-amber-200">
      Visible fragment boundaries differ from the compiled rigid colliders. Re-bake before export and review the Collider delta Canvas diagnostic.
    </p>}

    <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-xs tabular-nums">
      <Metric label="Topology transition" value={`1 source → ${analysis.renderPolygonCount} fragments`} />
      <Metric label="Event phase" value={analysis.atEvent ? 'Exact event' : analysis.phase === 'source' ? 'Before event' : 'After event'} />
      <Metric label="Render / collider" value={`${analysis.renderPolygonCount} / ${analysis.colliderPolygonCount}`} />
      <Metric label="Maximum boundary delta" value={`${formatNumber(analysis.maxBoundaryDeltaPx, 4)} px`} />
      <Metric label="Mean boundary delta" value={`${formatNumber(analysis.meanBoundaryDeltaPx, 4)} px`} />
      <Metric label="Boundary samples" value={String(analysis.sampleCount)} />
    </dl>

    <p className="mt-3 text-xs leading-5 text-gray-400">
      The event replaces the source and activates all fragment bodies on one solver tick. Static environment colliders are excluded from these delta values.
    </p>
  </section>
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return <><dt className="text-gray-400">{label}</dt><dd className="break-words text-right font-mono text-gray-200">{value}</dd></>
}

function StatusBadge({ label, tone }: { readonly label: string; readonly tone: 'good' | 'warning' }) {
  return <span className={`shrink-0 whitespace-nowrap rounded border px-2 py-1 text-xs font-medium ${tone === 'good'
    ? 'border-sky-800/70 bg-sky-950/30 text-sky-200'
    : 'border-amber-800/70 bg-amber-950/30 text-amber-200'}`}>{label}</span>
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { maximumFractionDigits, minimumFractionDigits: 0, useGrouping: false })
}

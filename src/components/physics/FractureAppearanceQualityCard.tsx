import { formatBytes } from '@/lib/format/formatBytes'
import type { FractureAppearanceQualityAnalysis } from '@/lib/fracture/FractureAppearanceQualityAnalyzer'

interface Props {
  readonly analysis: FractureAppearanceQualityAnalysis
}

/**
 * Presents event-frame fracture geometry and mask-memory diagnostics.
 *
 * This component owns no state and performs no scene analysis. Text labels
 * carry every status so pass, warning and unavailable results remain legible
 * without color. An unavailable result includes the recovery path beside the
 * cause rather than leaving the user with a diagnostic code alone.
 */
export default function FractureAppearanceQualityCard({ analysis }: Props) {
  if (analysis.status === 'unavailable') {
    return <section aria-label="Fracture appearance quality"
      className="mt-3 rounded-md border border-amber-800/70 bg-amber-950/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-xs font-semibold text-gray-100">Appearance quality</h5>
        <StatusBadge label="Unavailable" tone="warning" />
      </div>
      <p className="mt-2 text-xs leading-5 text-amber-200">{analysis.reason}</p>
      <p className="mt-1 text-xs leading-5 text-gray-400">
        Re-bake from the current source. If the source is missing, restore or relink it first.
      </p>
    </section>
  }

  const aligned = analysis.status === 'pass'
  return <section aria-label="Fracture appearance quality"
    className={`mt-3 rounded-md border p-3 ${aligned
      ? 'border-emerald-900/70 bg-emerald-950/10'
      : 'border-amber-800/70 bg-amber-950/20'}`}>
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="min-w-0">
        <h5 className="text-xs font-semibold text-gray-100">Appearance quality</h5>
        <p className="mt-1 text-xs leading-5 text-gray-400">
          Exact event · {formatNumber(analysis.eventTimeMs, 3)} ms · {analysis.appearanceKind === 'image' ? 'Image mesh' : 'Solid path'}
        </p>
      </div>
      <StatusBadge label={aligned ? 'Geometry aligned' : 'Review alignment'} tone={aligned ? 'good' : 'warning'} />
    </div>

    {!aligned && <p className="mt-2 rounded border border-amber-800/60 bg-amber-950/30 p-2 text-xs leading-5 text-amber-200">
      A fragment no longer matches the source at the topology event. Re-bake before export, then inspect the event frame again.
    </p>}

    <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-xs tabular-nums">
      <Metric label="Maximum event gap" value={`${formatNumber(analysis.maxEventAlignmentGapPx, 4)} px`} />
      <Metric label="Mean event gap" value={`${formatNumber(analysis.meanEventAlignmentGapPx, 4)} px`} />
      <Metric label="Area delta" value={`${formatNumber(analysis.eventAreaDeltaPercent, 5)}%`} />
      <Metric label="Shared boundaries" value={`${analysis.sharedEdgeCount} · ${formatNumber(analysis.sharedBoundaryLengthPx, 1)} px`} />
      <Metric label="Fragments / triangles" value={`${analysis.fragmentCount} / ${analysis.triangleCount}`} />
      <Metric label="Current mask scratch" value={analysis.maskedFragmentCount
        ? `${formatBytes(analysis.estimatedCurrentMaskScratchPeakBytes)} · ${analysis.maskedFragmentCount} masked`
        : '0 B · mask-free'} />
      <Metric label="Full-frame mask path" value={formatBytes(analysis.fullFrameMaskAlternativePeakBytes)} />
    </dl>

    <p className="mt-3 text-xs leading-5 text-gray-400">
      Geometry is measured before physical separation. The full-frame value estimates four simultaneous RGBA8 surfaces; decoded image and GPU memory are excluded.
    </p>
  </section>
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return <>
    <dt className="text-gray-400">{label}</dt>
    <dd className="break-words text-right font-mono text-gray-200">{value}</dd>
  </>
}

function StatusBadge({ label, tone }: { readonly label: string; readonly tone: 'good' | 'warning' }) {
  return <span className={`shrink-0 whitespace-nowrap rounded border px-2 py-1 text-xs font-medium ${tone === 'good'
    ? 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200'
    : 'border-amber-800/70 bg-amber-950/30 text-amber-200'}`}>{label}</span>
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
    useGrouping: false,
  })
}

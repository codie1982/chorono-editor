import type { ArrayAuthoringController } from './useArrayAuthoring'

/** Bounded world-space outlines use the exact native solution shown on canvas.
 * This miniature never calls legacy solvers or allocates scene layers/IDs. */
export function ArrayPreviewSummary({ plan }: { plan: ArrayAuthoringController['plan'] }) {
  if (!plan) return null
  const points = plan.preview.outlines.flatMap(outline => outline.points)
  const minX = points.length ? Math.min(...points.map(point => point.x)) : 0, minY = points.length ? Math.min(...points.map(point => point.y)) : 0
  const maxX = points.length ? Math.max(...points.map(point => point.x)) : 1, maxY = points.length ? Math.max(...points.map(point => point.y)) : 1
  const width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY)
  const pad = Math.max(width, height) * 0.05
  const summary = plan.summary
  return <section aria-label="Array preview summary" className="mb-3 rounded border border-slate-700 bg-slate-950 p-2 text-xs">
    <svg aria-label="Array miniature preview" viewBox={`${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`} className="mb-2 h-28 w-full">
      {plan.preview.outlines.map((outline, index) => <polygon key={index} points={outline.points.map(point => `${point.x},${point.y}`).join(' ')}
        fill="none" stroke={outline.occurrenceIndex === 0 ? '#67e8f9' : '#60a5fa'} strokeWidth={Math.max(width, height) / 160} />)}
    </svg>
    <p>{summary.sourceRoots} source roots · {summary.sourceLayers} source layers</p>
    <p>{summary.totalOccurrences} total occurrences · {summary.newOccurrences} new occurrences</p>
    <p>{summary.newLayers} new layers · {summary.newKeys} new keys · one undo</p>
    <p className="mt-1 text-slate-400">{plan.preview.outlines.length} preview outlines{plan.preview.truncated ? ' · bounded preview; Apply includes the full admitted result.' : ''}</p>
  </section>
}

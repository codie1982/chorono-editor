import type { RigidBodyBakeReport } from '@/lib/bake'

/**
 * Compact, read-only quality summary shared by workspace and MCP bake cards.
 *
 * The key count is deliberately labelled retained/candidate so simplification
 * is visible rather than appearing as data loss. Error values are measured
 * post-simplification in composition pixels and unwrapped degrees.
 */
export function BakeReportMetrics({ report }: { readonly report: RigidBodyBakeReport }) {
  return <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
    <dt className="text-gray-500">Samples</dt>
    <dd className="text-right font-mono tabular-nums text-gray-200">{report.sampleCount.toLocaleString()}</dd>
    <dt className="text-gray-500">Bodies</dt>
    <dd className="text-right font-mono tabular-nums text-gray-200">{report.bodyCount.toLocaleString()}</dd>
    <dt className="text-gray-500" title="Retained / candidate keyframes">Keys retained / candidate</dt>
    <dd className="text-right font-mono tabular-nums text-gray-200"
      title="Retained / candidate keyframes">
      {report.keyframeCount.toLocaleString()} / {report.rawKeyframeCount.toLocaleString()}
    </dd>
    <dt className="text-gray-500">Protected events</dt>
    <dd className="text-right font-mono tabular-nums text-gray-200">{report.protectedEventCount.toLocaleString()}</dd>
    <dt className="text-gray-500">Maximum error</dt>
    <dd className="text-right font-mono tabular-nums text-gray-200"
      aria-label={`Maximum error ${formatError(report.maxVertexErrorPx)} pixels and ${formatError(report.maxAngleErrorDeg)} degrees`}>
      {formatError(report.maxVertexErrorPx)} px · {formatError(report.maxAngleErrorDeg)}°
    </dd>
    <dt className="text-gray-500">Preview memory</dt>
    <dd className="text-right font-mono tabular-nums text-gray-200">{formatBytes(report.retainedBytes)}</dd>
  </dl>
}

/** Format a verified error without displaying meaningless trailing zeros. */
function formatError(value: number): string {
  if (value === 0) return '0'
  if (value < .001) return '<0.001'
  return value.toFixed(3).replace(/\.?0+$/, '')
}

/** Format retained preview bytes without implying exact process memory. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
}

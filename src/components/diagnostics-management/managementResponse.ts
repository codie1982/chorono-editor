import { createBuildInfo } from '@/lib/version'
import { convertDiagnosticFailure } from '@/lib/diagnostics'
import type { DiagnosticIssue, DiagnosticIssuePage } from '@/lib/diagnostics/management'

/** Reconstruct one bounded code-only management row. The authenticated service
 * is still a wire boundary: malformed data never becomes arbitrary UI labels,
 * links or status values. Count/received times are server values, not people or
 * event timestamps. Unknown object fields are not copied. */
export function readManagementIssue(value: unknown): DiagnosticIssue {
  if (!value || typeof value !== 'object') throw Error('invalid-response')
  const row = value as Record<string, unknown>
  const failure = convertDiagnosticFailure({ failureSite: row.failureSite })
  if (!failure || row.errorCode !== failure.errorCode || row.module !== failure.module ||
    row.classification !== failure.classification || row.severity !== failure.severity ||
    typeof row.key !== 'string' || row.key.length !== 64 || !/^[a-f0-9]{64}$/.test(row.key) ||
    typeof row.appVersion !== 'string' || typeof row.buildId !== 'string' || typeof row.channel !== 'string' ||
    !validInteger(row.occurrenceCount, 1) || !validInteger(row.revision) ||
    !validTime(row.firstSeenAtMs) || !validTime(row.lastSeenAtMs) || row.firstSeenAtMs > row.lastSeenAtMs ||
    !(row.updatedAtMs === null || validTime(row.updatedAtMs)) ||
    typeof row.status !== 'string' || !['new', 'investigating', 'fixed'].includes(row.status)) throw Error('invalid-response')
  const build = createBuildInfo(row.appVersion, { buildId: row.buildId, channel: row.channel })
  if (build.buildId !== row.buildId || build.channel !== row.channel) throw Error('invalid-response')
  if (row.example !== null) {
    const example = row.example as Record<string, unknown> | undefined
    if (!example || example.operation !== failure.sample.operation || example.outcome !== failure.sample.outcome) throw Error('invalid-response')
  }
  return Object.freeze({ key: row.key, ...build, errorCode: failure.errorCode, module: failure.module,
    failureSite: failure.failureSite, classification: failure.classification, severity: failure.severity,
    occurrenceCount: row.occurrenceCount, firstSeenAtMs: row.firstSeenAtMs, lastSeenAtMs: row.lastSeenAtMs,
    status: row.status as DiagnosticIssue['status'], revision: row.revision,
    updatedAtMs: row.updatedAtMs as number | null, example: row.example === null ? null : failure.sample })
}

/** Decode a finite, authenticated page without retaining unrecognized metadata.
 * The server caps pages at100; counts cover the version filter before status
 * filtering, while total covers both filters. Empty/out-of-range pages are valid. */
export function readManagementPage(value: unknown): DiagnosticIssuePage {
  if (!value || typeof value !== 'object') throw Error('invalid-response')
  const page = value as Record<string, unknown>, counts = page.counts as Record<string, unknown> | undefined
  if (!Array.isArray(page.items) || page.items.length > 100 || !validInteger(page.total) ||
    !validInteger(page.offset) || !validInteger(page.limit, 1) || page.limit > 100 || page.items.length > page.limit ||
    !counts || !validInteger(counts.new) || !validInteger(counts.investigating) || !validInteger(counts.fixed)) throw Error('invalid-response')
  const items = page.items.map(readManagementIssue)
  if (new Set(items.map(item => item.key)).size !== items.length) throw Error('invalid-response')
  return Object.freeze({ items: Object.freeze(items), total: page.total, offset: page.offset, limit: page.limit,
    counts: Object.freeze({ new: counts.new, investigating: counts.investigating, fixed: counts.fixed }) })
}

/** Safe bounded server counter/revision, never coerced from strings. */
function validInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
}
/** Epoch milliseconds accepted by Date without extended floating-point values. */
function validTime(value: unknown): value is number { return validInteger(value) && value <= 8_640_000_000_000_000 }

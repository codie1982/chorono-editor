import { createBuildInfo } from '@/lib/version'
import { measureJson } from '@/lib/format/json'
import { DIAGNOSTIC_MAX_COUNT, DIAGNOSTIC_MAX_REPORT_BYTES, DIAGNOSTIC_SCHEMA_VERSION,
  type DiagnosticReport } from '../contracts/types'
import { convertDiagnosticFailure } from './convertDiagnosticFailure'
import { diagnosticField } from './diagnosticFields'

/** Validate a real UTC calendar day; no local timezone or absolute event time
 * enters the result. Malformed/overflow dates are rejected, never normalized. */
function validDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const time = Date.parse(`${day}T00:00:00.000Z`)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day
}

/** Reconstruct a bounded transport-neutral report from an occurrence summary.
 * Every output field is allowlisted and copied; extra caller fields, getters,
 * toJSON, prototype values and arbitrary sample details never enter the result.
 * Invalid/mismatched catalogue/build/count/day metadata returns undefined.
 *
 * reportId must be a fresh random UUID supplied by the future consent/delivery
 * owner; this function neither generates it nor treats it as a user identity.
 * Retry must reuse the same ID AND frozen count delta. UTC day granularity and
 * at most one code-only sample are preserved. Existing JSON preflight enforces
 * the 16 KiB wire ceiling without invoking custom serialization. No side effects.
 */
export function convertDiagnosticReport(summary: unknown, reportId: unknown): DiagnosticReport | undefined {
  if (typeof reportId !== 'string' || reportId.length !== 36 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(reportId)) return
  const failure = convertDiagnosticFailure(summary)
  if (!failure) return
  for (const key of ['errorCode', 'module', 'classification', 'severity'] as const) {
    if (diagnosticField(summary, key) !== failure[key]) return
  }
  const sample = diagnosticField(summary, 'sample')
  if (diagnosticField(sample, 'operation') !== failure.sample.operation ||
    diagnosticField(sample, 'outcome') !== failure.sample.outcome) return
  const appVersion = diagnosticField(summary, 'appVersion'), buildId = diagnosticField(summary, 'buildId')
  const channel = diagnosticField(summary, 'channel'), day = diagnosticField(summary, 'day')
  const occurrenceCount = diagnosticField(summary, 'occurrenceCount')
  if (typeof appVersion !== 'string' || typeof buildId !== 'string' || typeof channel !== 'string' ||
    !validDay(day) || typeof occurrenceCount !== 'number' || !Number.isSafeInteger(occurrenceCount) ||
    occurrenceCount < 1 || occurrenceCount > DIAGNOSTIC_MAX_COUNT) return
  try {
    const build = createBuildInfo(appVersion, { buildId, channel })
    if (build.buildId !== buildId || build.channel !== channel) return
    const report: DiagnosticReport = Object.freeze({ schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      reportId, ...build, ...failure, day, occurrenceCount })
    measureJson(report, { maxBytes: DIAGNOSTIC_MAX_REPORT_BYTES, maxChars: DIAGNOSTIC_MAX_REPORT_BYTES, maxNodes: 40, maxDepth: 3 })
    return report
  } catch { return undefined }
}

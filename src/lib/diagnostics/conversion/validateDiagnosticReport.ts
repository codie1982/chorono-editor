import { measureJson } from '@/lib/format/json'
import { DIAGNOSTIC_MAX_REPORT_BYTES, DIAGNOSTIC_SCHEMA_VERSION, type DiagnosticReport } from '../contracts/types'
import { convertDiagnosticReport } from './convertDiagnosticReport'

const fields = ['schemaVersion', 'reportId', 'appVersion', 'buildId', 'channel', 'errorCode',
  'module', 'failureSite', 'classification', 'severity', 'sample', 'day', 'occurrenceCount']

/** Accept exactly the public JSON data fields, with no inherited fields,
 * symbols, accessors or custom serialization. This stricter boundary is shared
 * by receiver and durable queue restore; conversion alone intentionally drops
 * extras and therefore is insufficient for untrusted persisted/wire payloads. */
function exactFields(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  try {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const keys = Reflect.ownKeys(value)
    return keys.length === expected.length && keys.every(key => typeof key === 'string' && expected.includes(key)
      && 'value' in Object.getOwnPropertyDescriptor(value, key)!)
  } catch { return false }
}

/** Validate and reconstruct one strictly allowlisted immutable report.
 * Unknown fields, wrong schema, native objects, malformed catalogue/build/date/
 * count/UUID and oversized JSON return undefined. No raw error or source data
 * survives validation; getters/toJSON are never invoked. No IO or mutation.
 */
export function validateDiagnosticReport(input: unknown): DiagnosticReport | undefined {
  if (!exactFields(input, fields) || input.schemaVersion !== DIAGNOSTIC_SCHEMA_VERSION ||
    !exactFields(input.sample, ['operation', 'outcome'])) return
  try {
    measureJson(input, { maxBytes: DIAGNOSTIC_MAX_REPORT_BYTES, maxChars: DIAGNOSTIC_MAX_REPORT_BYTES, maxNodes: 40, maxDepth: 3 })
    return convertDiagnosticReport(input, input.reportId)
  } catch { return undefined }
}

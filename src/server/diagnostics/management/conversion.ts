import type { DiagnosticIssueQuery, DiagnosticIssueStatus } from '@/lib/diagnostics/management'
import { validateDiagnosticIssueQuery } from '../issueProjection'
import { DiagnosticRepositoryError } from '../types'

/** Convert bounded HTTP query strings to the existing authoritative domain
 * validator. Duplicate/unknown keys are rejected, never silently overwritten.
 * Decimal offset/limit use canonical nonnegative integers; defaults are owned
 * by validateDiagnosticIssueQuery, shared with non-HTTP repository callers. */
export function managementQuery(url: string): DiagnosticIssueQuery {
  if (url.length > 4096) throw new DiagnosticRepositoryError('invalid-issue-query')
  const query = new URL(url).searchParams, values: Record<string, string | number> = {}
  for (const [key, value] of Array.from(query.entries())) {
    if (!['offset', 'limit', 'status', 'appVersion', 'sort'].includes(key) || key in values) {
      throw new DiagnosticRepositoryError('invalid-issue-query')
    }
    if (key === 'offset' || key === 'limit') {
      if (!/^(?:0|[1-9]\d{0,4})$/.test(value)) throw new DiagnosticRepositoryError('invalid-issue-query')
      values[key] = Number(value)
    } else values[key] = value
  }
  return validateDiagnosticIssueQuery(values as DiagnosticIssueQuery)
}

export interface DiagnosticIssueUpdate {
  readonly key: string
  readonly status: DiagnosticIssueStatus
  readonly expectedRevision: number
}

/** Strict native status command; no notes, authored text or arbitrary metadata.
 * The repository repeats domain checks and atomically compares the revision.
 * Bad input returns undefined rather than echoing it in an HTTP error. */
export function managementUpdate(input: unknown): DiagnosticIssueUpdate | undefined {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype ||
    Object.keys(input).sort().join(',') !== 'expectedRevision,key,status') return
  const key = Object.getOwnPropertyDescriptor(input, 'key')?.value
  const status = Object.getOwnPropertyDescriptor(input, 'status')?.value
  const expectedRevision = Object.getOwnPropertyDescriptor(input, 'expectedRevision')?.value
  if (typeof key !== 'string' || key.length !== 64 || !/^[a-f0-9]{64}$/.test(key) ||
    !['new', 'investigating', 'fixed'].includes(status as string) ||
    typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return
  return Object.freeze({ key, status: status as DiagnosticIssueStatus, expectedRevision })
}

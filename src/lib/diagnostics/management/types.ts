import type { BuildInfo } from '@/lib/version'
import type { DiagnosticFailure, DiagnosticSample } from '../contracts/types'

export type DiagnosticIssueStatus = 'new' | 'investigating' | 'fixed'
export type DiagnosticIssueSort = 'recent' | 'occurrences'

/** One retained issue across UTC days for one exact build/code/static site.
 * Counts are occurrences, not people. First/last times are server receipt epoch
 * milliseconds; legacy data may have only its original group creation time.
 * Revision applies only to manual triage, not incoming occurrence increments.
 */
export interface DiagnosticIssue extends Omit<DiagnosticFailure, 'sample'>, BuildInfo {
  readonly key: string
  readonly occurrenceCount: number
  readonly firstSeenAtMs: number
  readonly lastSeenAtMs: number
  readonly status: DiagnosticIssueStatus
  readonly revision: number
  readonly updatedAtMs: number | null
  readonly example: DiagnosticSample | null
}

/** Finite issue view. Counts reflect version-filtered issues before the status
 * filter; total reflects both filters. Offset/limit apply after stable sorting. */
export interface DiagnosticIssuePage {
  readonly items: readonly DiagnosticIssue[]
  readonly total: number
  readonly counts: Readonly<Record<DiagnosticIssueStatus, number>>
  readonly offset: number
  readonly limit: number
}

/** Query is validated by the server domain. Default50/max100 rows and max10k
 * offset match the bounded retained repository; no source/user query is accepted. */
export interface DiagnosticIssueQuery {
  readonly status?: 'all' | DiagnosticIssueStatus
  readonly appVersion?: string
  readonly sort?: DiagnosticIssueSort
  readonly offset?: number
  readonly limit?: number
}

export interface ResolvedDiagnosticIssueQuery {
  readonly status: 'all' | DiagnosticIssueStatus
  readonly appVersion?: string
  readonly sort: DiagnosticIssueSort
  readonly offset: number
  readonly limit: number
}

/** A repository supplies an already aggregated view and atomic CAS triage.
 * Retention can remove an issue; missing IDs and stale revisions are explicit
 * failures. Incoming reports must not reset a user's chosen status. */
export interface DiagnosticIssueRepository {
  listIssues(query?: DiagnosticIssueQuery): Promise<DiagnosticIssuePage>
  setIssueStatus(key: string, status: DiagnosticIssueStatus, expectedRevision: number): Promise<DiagnosticIssue>
}

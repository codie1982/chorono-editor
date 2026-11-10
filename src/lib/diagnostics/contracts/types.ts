import type { BuildInfo } from '@/lib/version'

export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const
export const DIAGNOSTIC_MAX_COUNT = 1_000_000
export const DIAGNOSTIC_MAX_GROUPS = 20
export const DIAGNOSTIC_MAX_REPORT_BYTES = 16 * 1024

export type DiagnosticErrorCode = 'EDIT_PREVIEW_FAILED' | 'EDIT_COMMIT_FAILED' |
  'UNEXPECTED_ROLLBACK' | 'UNHANDLED_ERROR' | 'UNHANDLED_REJECTION' | 'RENDER_FAILED'
export type DiagnosticViewportTool = 'object-move' | 'object-rotate' | 'object-scale' |
  'object-anchor' | 'object-resize' | 'guide' | 'shape-placement' | 'motion-key'
export type DiagnosticFailureSite = `viewport.${DiagnosticViewportTool}.${'preview' | 'commit' | 'rollback'}` |
  'application.unhandled-error' | 'application.unhandled-rejection' | 'application.render-failed'
export type DiagnosticOperation = 'move' | 'rotate' | 'scale' | 'anchor' | 'resize' |
  'guide' | 'shape-placement' | 'motion-key' | 'application'

/** A single catalogued example, never a raw exception or interaction event.
 * Both values come from static application definitions, not caller text. */
export interface DiagnosticSample {
  readonly operation: DiagnosticOperation
  readonly outcome: 'preview-failed' | 'commit-failed' | 'unexpected-rollback' | 'unhandled' | 'render-failed'
}

/** Allowlisted failure meaning. Unknown application errors are an unclassified
 * bucket, not a claim that their occurrences share one underlying bug. */
export interface DiagnosticFailure {
  readonly errorCode: DiagnosticErrorCode
  readonly module: 'viewport' | 'application'
  readonly failureSite: DiagnosticFailureSite
  readonly classification: 'known' | 'unclassified'
  readonly severity: 'error' | 'fatal'
  readonly sample: DiagnosticSample
}

/** One UTC calendar-day occurrence summary for a fixed application build.
 * Count means occurrences, not people. The sample is the first safe example.
 * No epoch timestamps, project/source identity or installation ID is retained. */
export interface DiagnosticSummary extends DiagnosticFailure, BuildInfo {
  readonly day: string
  readonly occurrenceCount: number
}

/** Immutable in-memory view. A store retains at most one UTC day's groups;
 * overflow counts occurrences whose new group cannot fit, without retaining IDs. */
export interface DiagnosticSummarySnapshot {
  readonly day: string | null
  readonly groups: readonly DiagnosticSummary[]
  readonly overflowCount: number
}

/** Versioned, transport-neutral summary. D1 owns consent, random report IDs,
 * frozen count deltas, retries and delivery. Reusing an ID must reuse its payload;
 * constructing this record alone neither records an error nor sends anything. */
export interface DiagnosticReport extends DiagnosticSummary {
  readonly schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION
  readonly reportId: string
}

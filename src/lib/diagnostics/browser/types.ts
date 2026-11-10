import type { DiagnosticConsentChoice } from '../consent/DiagnosticConsentRepository'
import type { DiagnosticSharingConfiguration } from '../consent/configuration'
import type { DiagnosticVersionSnapshot } from './DiagnosticVersionChecker'

/** Stable readonly UI view; no report body or local trace is exposed here. */
export interface DiagnosticSharingSnapshot extends DiagnosticVersionSnapshot {
  readonly ready: boolean
  readonly configured: boolean
  readonly configuration: DiagnosticSharingConfiguration | null
  readonly choice: DiagnosticConsentChoice
  readonly storageAvailable: boolean
  readonly queueAvailable: boolean
  readonly queued: number
  readonly dropped: number
  readonly lastOutcome: string
}
export const EMPTY_DIAGNOSTIC_SHARING: DiagnosticSharingSnapshot = Object.freeze({ ready: false,
  configured: false, configuration: null, choice: 'unknown', storageAvailable: false,
  queueAvailable: false, queued: 0, dropped: 0, lastOutcome: 'idle', latestVersion: null,
  notesUrl: null, versionStatus: 'idle' })

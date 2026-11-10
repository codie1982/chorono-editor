import type { BuildInfo } from '@/lib/version'
import type { DiagnosticReport } from '../contracts/types'

export const DIAGNOSTIC_OUTBOX_KEY = 'chorono.diagnostics.outbox.v1'
export const DIAGNOSTIC_DELIVERY_INTERVAL_MS = 5 * 60 * 1000
export const DIAGNOSTIC_OUTBOX_TTL_MS = 24 * 60 * 60 * 1000
export const DIAGNOSTIC_OUTBOX_MAX_BYTES = 256 * 1024
export const DIAGNOSTIC_OUTBOX_MAX_ITEMS = 200
export const DIAGNOSTIC_MAX_ATTEMPTS = 5
export const DIAGNOSTIC_POLICY_VERSION = 'summary-v1' as const

/** Local permission epoch. Generation is never part of an uploaded report. */
export interface DiagnosticDeliveryConsent {
  readonly choice: 'unknown' | 'allowed' | 'denied' | 'dismissed'
  readonly generation: string
  readonly endpoint: string
  readonly policyVersion: typeof DIAGNOSTIC_POLICY_VERSION
}

/** Small storage contract; ownership remains with browser composition. */
export interface DiagnosticDeliveryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type DiagnosticDeliveryOutcome = 'idle' | 'sent' | 'retrying' | 'failed'
export interface DiagnosticDeliverySnapshot {
  readonly queued: number
  readonly dropped: number
  readonly lastOutcome: DiagnosticDeliveryOutcome
  readonly lastSentAt: number | null
  readonly nextAttemptAt: number | null
}

/** Dependencies are borrowed; no browser singleton or timer loop is created.
 * withLock must serialize ALL tabs using this outbox, including the actual
 * request lifetime. Callbacks must eventually settle even on host disposal. */
export interface DiagnosticDeliveryOptions {
  readonly build: BuildInfo
  readonly endpoint: string
  readonly readConsent: () => DiagnosticDeliveryConsent | undefined
  readonly storage: DiagnosticDeliveryStorage
  readonly withLock: <T>(work: () => Promise<T>) => Promise<T>
  readonly fetch: (url: string, options: RequestInit) => Promise<Response>
  readonly randomId: () => string
  readonly canSend: () => boolean
  readonly clock?: () => number
  readonly onChange?: () => void
  readonly scheduleTimeout?: (callback: () => void, delayMs: number) => unknown
  readonly cancelTimeout?: (handle: unknown) => void
}

/** Persist only safe reports. An attempted report is frozen across every retry;
 * later occurrences of its group must use a separate item and UUID. */
export interface DiagnosticOutboxItem {
  readonly report: DiagnosticReport
  readonly createdAt: number
  readonly attempts: number
  readonly nextAttemptAt: number
}

/** Local-only queue envelope, never uploaded. Seen groups enforce the daily
 * cap even after ACK; they are code-only first reports, not user identifiers. */
export interface DiagnosticOutboxState {
  readonly schemaVersion: 1
  readonly generation: string
  readonly endpoint: string
  readonly policyVersion: typeof DIAGNOSTIC_POLICY_VERSION
  readonly day: string | null
  readonly seen: readonly DiagnosticReport[]
  readonly items: readonly DiagnosticOutboxItem[]
  readonly dropped: number
  readonly lastAttemptAt: number | null
  readonly lastSentAt: number | null
  readonly lastTime: number
  readonly lastOutcome: DiagnosticDeliveryOutcome
}

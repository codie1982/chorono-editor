import { createBuildInfo, type BuildInfo } from '@/lib/version'
import { DIAGNOSTIC_MAX_COUNT, DIAGNOSTIC_MAX_GROUPS } from '../contracts/types'
import type { DiagnosticSummary, DiagnosticSummarySnapshot } from '../contracts/types'
import { convertDiagnosticFailure } from '../conversion/convertDiagnosticFailure'

/** Outcome of an explicitly supplied occurrence. Overflow counts occurrences
 * outside the bounded group set, not distinct errors or affected users. */
export type DiagnosticRecordResult = 'recorded' | 'overflow' | 'saturated' | 'ignored-input' | 'ignored-clock'

/** Finite per-instance policy. Lower limits are useful for embedded consumers
 * and tests; callers cannot exceed the first-release product limits. */
export interface DiagnosticSummaryStoreOptions {
  readonly clock?: () => number
  readonly maxGroups?: number
  readonly maxCount?: number
}

/** Aggregate catalogued application failures without retaining raw input.
 *
 * This mutable owner holds only one UTC day's bounded, frozen summaries. Each
 * instance has its own map, count limits and injected epoch-millisecond clock;
 * there are no singletons, listeners, timers, storage, consent or network jobs.
 * Construction does not start collection. A future consent owner may create an
 * instance only after permission and call `record` for approved failures.
 *
 * Static release identity plus error code/module/failure site define a group.
 * The first allowlisted sample is retained deterministically; every occurrence
 * increments only a saturating integer. Snapshots and nested samples are frozen
 * and retain identity until visible data changes. Input objects, errors, scene
 * handles and raw Interaction events are never kept.
 *
 * A valid occurrence on a later UTC day replaces the previous day's summaries.
 * Invalid or backward clock samples are ignored, including a backwards move
 * within the same day. `clear` drops evidence without rewinding that high-water
 * clock. This is an in-memory counter, not the later delivery/retry queue.
 */
export class DiagnosticSummaryStore {
  private readonly build: BuildInfo
  private readonly clock: () => number
  private readonly maxGroups: number
  private readonly maxCount: number
  private readonly groups = new Map<string, DiagnosticSummary>()
  private latestTime = -Infinity
  private snapshot: DiagnosticSummarySnapshot = Object.freeze({
    day: null, groups: Object.freeze([]), overflowCount: 0,
  })

  /** Copy a validated release identity and finite policy. Invalid app metadata,
   * a build/channel inconsistent with its public factory, or invalid limits
   * throw RangeError before any occurrence is accepted. The clock is borrowed
   * but not called during construction. No caller-owned object is retained. */
  constructor(build: BuildInfo, options: DiagnosticSummaryStoreOptions = {}) {
    const normalized = createBuildInfo(build.appVersion, { buildId: build.buildId, channel: build.channel })
    if (normalized.buildId !== build.buildId || normalized.channel !== build.channel) {
      throw new RangeError('Diagnostic summaries require validated build metadata.')
    }
    this.build = normalized
    this.clock = options.clock ?? Date.now
    this.maxGroups = options.maxGroups ?? DIAGNOSTIC_MAX_GROUPS
    this.maxCount = options.maxCount ?? DIAGNOSTIC_MAX_COUNT
    if (!Number.isSafeInteger(this.maxGroups) || this.maxGroups < 1 || this.maxGroups > DIAGNOSTIC_MAX_GROUPS
      || !Number.isSafeInteger(this.maxCount) || this.maxCount < 1 || this.maxCount > DIAGNOSTIC_MAX_COUNT) {
      throw new RangeError('Invalid diagnostic summary limits.')
    }
  }

  /** Read the current immutable snapshot, without sampling time or resetting a
   * day. Data changes only when record/clear explicitly changes retained counts. */
  readonly getSnapshot = (): DiagnosticSummarySnapshot => this.snapshot

  /** Convert an explicit static failure-site input, then count it once.
   * Unknown input, normal cancellation and invalid/backward epoch milliseconds
   * return an ignored result and preserve snapshot identity. Clock exceptions
   * are isolated. Valid duplicate occurrences retain the first group's sample;
   * counts stop at maxCount and return saturated without allocating a snapshot.
   * UTC rollover is evaluated only for accepted failures. Work and retained
   * storage are bounded by maxGroups; input is neither mutated nor retained. */
  record(input: unknown): DiagnosticRecordResult {
    const failure = convertDiagnosticFailure(input)
    if (!failure) return 'ignored-input'
    let now: number
    try { now = this.clock() } catch { return 'ignored-clock' }
    // Keep the public day contract at YYYY-MM-DD rather than Date's extended years.
    if (!Number.isSafeInteger(now) || now < 0 || now > 253_402_300_799_999 || now < this.latestTime) {
      return 'ignored-clock'
    }
    const day = new Date(now).toISOString().slice(0, 10)
    const rollover = day !== this.snapshot.day
    if (rollover) this.groups.clear()
    this.latestTime = now
    const overflow = rollover ? 0 : this.snapshot.overflowCount
    const key = JSON.stringify([this.build.appVersion, this.build.buildId, this.build.channel,
      failure.errorCode, failure.module, failure.failureSite])
    const existing = this.groups.get(key)
    if (existing) {
      if (existing.occurrenceCount >= this.maxCount) return 'saturated'
      this.groups.set(key, Object.freeze({ ...existing, occurrenceCount: existing.occurrenceCount + 1 }))
    } else if (this.groups.size < this.maxGroups) {
      this.groups.set(key, Object.freeze({ ...failure, ...this.build, day, occurrenceCount: 1 }))
    } else {
      if (overflow >= this.maxCount) return 'saturated'
      this.publish(day, overflow + 1)
      return 'overflow'
    }
    this.publish(day, overflow)
    return 'recorded'
  }

  /** Drop summaries and the overflow count. Keep the UTC day and clock high
   * water so clearing evidence cannot re-admit an earlier occurrence day. */
  clear(): void {
    if (!this.groups.size && !this.snapshot.overflowCount) return
    this.groups.clear()
    this.publish(this.snapshot.day, 0)
  }

  /** Freeze copied insertion-order data; first-seen group order is stable. */
  private publish(day: string | null, overflowCount: number): void {
    this.snapshot = Object.freeze({ day, groups: Object.freeze(Array.from(this.groups.values())), overflowCount })
  }
}

import { createBuildInfo, type BuildInfo } from '@/lib/version'
import { utf8ByteLength } from '@/lib/format/json'
import { convertDiagnosticFailure } from '../conversion/convertDiagnosticFailure'
import { DIAGNOSTIC_MAX_COUNT } from '../contracts/types'
import { decodeOutbox, diagnosticTime, emptyOutbox, encodeOutbox } from './outboxCodec'
import { diagnosticDrop, expireOutbox, outboxNextAttempt, recordOutbox } from './outboxPolicy'
import { sendDiagnosticReport } from './sendDiagnosticReport'
import { DIAGNOSTIC_DELIVERY_INTERVAL_MS, DIAGNOSTIC_MAX_ATTEMPTS, DIAGNOSTIC_OUTBOX_KEY,
  DIAGNOSTIC_OUTBOX_MAX_BYTES, DIAGNOSTIC_POLICY_VERSION, type DiagnosticDeliveryConsent, type DiagnosticDeliveryOptions,
  type DiagnosticDeliverySnapshot, type DiagnosticOutboxState } from './types'

const EMPTY: DiagnosticDeliverySnapshot = Object.freeze({ queued: 0, dropped: 0,
  lastOutcome: 'idle', lastSentAt: null, nextAttemptAt: null })

/** Persistent opt-in outbox dispatcher. Owns only one active abort controller;
 * storage/fetch/time/UUID/inter-tab lock and scheduling are explicit host ports.
 * Constructor/imports start no collection, timer or network. All async work is
 * serialized by the host lock; lock lifetime includes the fetch/ACK, so a second
 * tab cannot send the same pending report concurrently. Every side effect is
 * bound to the current local consent generation/endpoint/policy. Revoke aborts
 * promptly, and late responses cannot repopulate a revoked queue.
 *
 * Unattempted groups merge occurrences. First attempt durably freezes its UUID
 * and count delta before sending; retries preserve both, new occurrences use a
 * later item. No local Interaction history, raw error or dynamic field is read.
 * Snapshots are immutable counters/status only; they never contain report data.
 * A browser owner schedules flush at nextAttemptAt and handles visibility/online;
 * this class creates only a finite request timeout while a real upload is active.
 */
export class DiagnosticDelivery {
  private readonly options: DiagnosticDeliveryOptions
  private readonly build: BuildInfo
  private readonly clock: () => number
  private readonly scheduleTimeout: NonNullable<DiagnosticDeliveryOptions['scheduleTimeout']>
  private readonly cancelTimeout: NonNullable<DiagnosticDeliveryOptions['cancelTimeout']>
  private controller: AbortController | undefined
  private cancelGeneration = 0
  private observedGeneration: string | undefined
  private pendingRecords = 0
  private pendingDrops = 0
  private pendingDropGeneration: string | undefined
  private snapshot = EMPTY

  /** Endpoint must be absolute HTTPS, or HTTP on a loopback host for local
   * acceptance. Userinfo/query/hash are rejected. Consent must name this exact
   * endpoint; the surrounding UI supplies the operator/retention disclosure. */
  constructor(options: DiagnosticDeliveryOptions) {
    const url = new URL(options.endpoint)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || (loopback && url.protocol === 'http:')) || url.href !== options.endpoint) {
      throw new RangeError('Invalid diagnostic delivery endpoint.')
    }
    this.build = createBuildInfo(options.build.appVersion, options.build)
    if (this.build.buildId !== options.build.buildId || this.build.channel !== options.build.channel) {
      throw new RangeError('Invalid diagnostic build metadata.')
    }
    this.options = Object.freeze({ ...options, build: this.build })
    this.clock = options.clock ?? Date.now
    this.scheduleTimeout = options.scheduleTimeout ?? ((callback, ms) => setTimeout(callback, ms))
    this.cancelTimeout = options.cancelTimeout ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>))
  }

  /** Stable, frozen view; report contents and local permission IDs stay private. */
  readonly getSnapshot = (): DiagnosticDeliverySnapshot => this.snapshot

  /** Restore/expire the current generation only after permission. No storage
   * read occurs before consent; malformed state is erased instead of uploaded. */
  async restore(): Promise<void> {
    await this.locked(async (state, consent, now) => { this.save(expireOutbox(state, now), consent) })
  }

  /** Convert one explicit failure only while allowed. Conversion happens before
   * awaiting a lock, so an arbitrary caller object/error is not retained by a
   * pending async callback. Permission is checked again inside the lock. */
  async record(input: unknown): Promise<void> {
    const consent = this.allowed()
    if (!consent) return
    const failure = convertDiagnosticFailure(input)
    input = undefined
    if (!failure) return
    if (this.pendingRecords >= 200) {
      if (this.pendingDropGeneration !== consent.generation) { this.pendingDrops = 0; this.pendingDropGeneration = consent.generation }
      this.pendingDrops = Math.min(DIAGNOSTIC_MAX_COUNT, this.pendingDrops + 1)
      return
    }
    this.pendingRecords++
    try {
      await this.locked(async (state, current, now) => {
        const next = recordOutbox(expireOutbox(state, now), failure, this.build, now, this.options.randomId)
        this.save(next, current)
      }, consent)
    } finally { this.pendingRecords-- }
  }

  /** Try at most one due item. No permission/queue/due/visibility means no
   * request. The stored attempt timestamp enforces a shared five-minute floor;
   * timeout/network/408/429/5xx retry at most five attempts with bounded jitter.
   * Permanent 4xx or exhausted retries drop the item with a visible counter. */
  async flush(): Promise<void> {
    if (!this.allowed() || !this.sendable()) return
    await this.locked(async (raw, consent, now) => {
      let state = expireOutbox(raw, now)
      const due = outboxNextAttempt(state)
      if (due === null || now < due || !this.sendable()) { this.save(state, consent); return }
      const index = state.items.findIndex(item => item.nextAttemptAt <= now)
      if (index < 0) { this.save(state, consent); return }
      const current = state.items[index], attempt = current.attempts + 1
      const frozen = { ...current, attempts: attempt }
      const items = state.items.slice(); items[index] = frozen
      state = { ...state, items, lastAttemptAt: now, lastTime: now }
      // Persist BEFORE requesting: crash/another tab retries exactly this delta.
      if (!this.save(state, consent) || !this.matches(consent) || !this.sendable()) return
      const generation = this.cancelGeneration, controller = new AbortController()
      this.controller = controller
      const timeout = this.scheduleTimeout(() => controller.abort(), 10_000)
      let result
      try { result = await sendDiagnosticReport(this.options.fetch, this.options.endpoint,
        frozen.report, controller.signal, now) }
      finally { this.cancelTimeout(timeout); if (this.controller === controller) this.controller = undefined }
      if (!this.matches(consent)) { this.publish(EMPTY); return }
      if (generation !== this.cancelGeneration) { this.publishState(state); return }
      const settledAt = this.now()
      if (settledAt === undefined || settledAt < state.lastTime) { this.publishState(state); return }
      const remaining = state.items.slice()
      if (result.kind === 'accepted') {
        remaining.splice(index, 1)
        state = { ...state, items: remaining, lastSentAt: settledAt, lastTime: settledAt, lastOutcome: 'sent' }
      } else if (result.kind === 'permanent' || attempt >= DIAGNOSTIC_MAX_ATTEMPTS) {
        remaining.splice(index, 1)
        state = diagnosticDrop({ ...state, items: remaining, lastTime: settledAt, lastOutcome: 'failed' })
      } else {
        // Deterministic ID-derived jitter avoids a new random identifier per retry.
        const jitter = parseInt(frozen.report.reportId.slice(0, 4), 16) % 1000
        const delay = Math.max(DIAGNOSTIC_DELIVERY_INTERVAL_MS * 2 ** (attempt - 1) + jitter, result.retryAfterMs ?? 0)
        remaining[index] = { ...frozen, nextAttemptAt: settledAt + delay }
        state = { ...state, items: remaining, lastTime: settledAt, lastOutcome: 'retrying' }
      }
      this.save(expireOutbox(state, settledAt), consent)
    })
  }

  /** Abort in-flight IO synchronously. Removal/revoke uses clear separately;
   * abort cannot recall a payload already received by the remote service. */
  cancel(): void { this.cancelGeneration++; this.controller?.abort() }

  /** Revoke cleanup for this owner's previously observed generation/endpoint.
   * A delayed cleanup never erases another endpoint, a different generation or
   * a queue that is currently allowed. Call cancel for prompt abort first.
   * Does not modify the consent preference; it is not a force-clear user action. */
  async clear(): Promise<void> {
    this.cancel()
    this.pendingDrops = 0; this.pendingDropGeneration = undefined
    const generation = this.observedGeneration
    try { await this.options.withLock(async () => {
      const raw = this.options.storage.getItem(DIAGNOSTIC_OUTBOX_KEY)
      if (raw !== null) {
        utf8ByteLength(raw, DIAGNOSTIC_OUTBOX_MAX_BYTES)
        const state = JSON.parse(raw)
        const current = this.allowed()
        if (state?.endpoint === this.options.endpoint && state?.policyVersion === DIAGNOSTIC_POLICY_VERSION &&
          (generation === undefined || state.generation === generation) && state.generation !== current?.generation) {
          this.options.storage.removeItem(DIAGNOSTIC_OUTBOX_KEY)
        }
      }
      this.publish(EMPTY)
    }) }
    catch { this.publish({ ...EMPTY, lastOutcome: 'failed' }) }
  }

  /** Acquire shared ownership, then reload current state. Never use a cached
   * queue from another tab or continue after permission/clock/storage failure. */
  private async locked(work: (state: DiagnosticOutboxState, consent: DiagnosticDeliveryConsent, now: number) => Promise<void>,
    expected = this.allowed()): Promise<void> {
    if (!expected) return
    try {
      await this.options.withLock(async () => {
        const consent = this.allowed(), now = this.now()
        if (!consent || consent.generation !== expected.generation || now === undefined) return
        let state = decodeOutbox(this.options.storage.getItem(DIAGNOSTIC_OUTBOX_KEY), consent)
        if (!state) {
          this.options.storage.removeItem(DIAGNOSTIC_OUTBOX_KEY)
          state = emptyOutbox(consent)
        }
        if (now < state.lastTime) return
        if (this.pendingDropGeneration === consent.generation) {
          state = diagnosticDrop(state, this.pendingDrops)
          this.pendingDrops = 0; this.pendingDropGeneration = undefined
        }
        await work(state, consent, now)
      })
    } catch { this.publish({ ...this.snapshot, lastOutcome: 'failed' }) }
  }

  /** Durable write is checked immediately against current permission. A failed
   * storage write prevents upload; it is never treated as successful admission. */
  private save(state: DiagnosticOutboxState, consent: DiagnosticDeliveryConsent): boolean {
    if (!this.matches(consent)) { this.publish(EMPTY); return false }
    this.options.storage.setItem(DIAGNOSTIC_OUTBOX_KEY, encodeOutbox(state))
    this.publishState(state)
    return true
  }

  private allowed(): DiagnosticDeliveryConsent | undefined {
    try {
      const consent = this.options.readConsent()
      const allowed = consent?.choice === 'allowed' && consent.endpoint === this.options.endpoint &&
        consent.policyVersion === DIAGNOSTIC_POLICY_VERSION && typeof consent.generation === 'string' &&
        consent.generation.length > 0 && consent.generation.length <= 80 ? consent : undefined
      if (allowed) this.observedGeneration = allowed.generation
      return allowed
    } catch { return undefined }
  }

  private matches(previous: DiagnosticDeliveryConsent): boolean {
    const current = this.allowed()
    return current?.generation === previous.generation
  }

  private now(): number | undefined { try { const now = this.clock(); return diagnosticTime(now) ? now : undefined } catch { return undefined } }
  private sendable(): boolean { try { return this.options.canSend() } catch { return false } }
  private publishState(state: DiagnosticOutboxState): void {
    this.publish({ queued: state.items.length, dropped: state.dropped, lastOutcome: state.lastOutcome,
      lastSentAt: state.lastSentAt, nextAttemptAt: outboxNextAttempt(state) })
  }
  /** Listener failures cannot affect delivery or user edits. */
  private publish(next: DiagnosticDeliverySnapshot): void {
    if (Object.keys(next).every(key => next[key as keyof DiagnosticDeliverySnapshot] === this.snapshot[key as keyof DiagnosticDeliverySnapshot])) return
    this.snapshot = Object.freeze(next)
    try { this.options.onChange?.() } catch { /* Diagnostics observers are isolated. */ }
  }
}

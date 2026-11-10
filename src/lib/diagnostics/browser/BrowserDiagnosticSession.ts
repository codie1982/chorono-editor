import { applicationBuildInfo } from '@/lib/version'
import { DiagnosticDelivery } from '../delivery'
import { DiagnosticConsentRepository, DIAGNOSTIC_CONSENT_KEY, type DiagnosticConsentChoice,
  type DiagnosticPreferenceStorage } from '../consent/DiagnosticConsentRepository'
import type { DiagnosticSharingConfiguration } from '../consent/configuration'
import type { DiagnosticFailureSite } from '../contracts/types'
import { DiagnosticVersionChecker } from './DiagnosticVersionChecker'
import { subscribeDiagnosticFailures } from './failureSignals'
import { EMPTY_DIAGNOSTIC_SHARING, type DiagnosticSharingSnapshot } from './types'

/** One browser ownership lease: preference subscription, code-only error sinks,
 * visibility/online/pointer lifecycle and one queue wake timer. Domain delivery,
 * consent persistence and version parsing are separate collaborators. No source
 * or raw Error is retained. Unsupported storage/locks fail closed. Disposal
 * aborts requests but preserves permission and durable queue for next launch. */
export class BrowserDiagnosticSession {
  private repository?: DiagnosticConsentRepository
  private delivery?: DiagnosticDelivery
  private version?: DiagnosticVersionChecker
  private timer?: ReturnType<typeof setTimeout>
  private disposed = false
  private pressed = false
  private storageAvailable = false
  private queueAvailable = false
  private blocked = false
  private blockedGeneration: string | null = null
  private lastGeneration = ''
  private choice: DiagnosticConsentChoice = 'unknown'
  private removeSignals?: () => void
  private channel?: BroadcastChannel

  /** Borrow explicit destination, current edit-idle predicate and UI observer.
   * Clock is epoch milliseconds; injection also drives deterministic native QA. */
  constructor(private readonly configuration: DiagnosticSharingConfiguration | null,
    private readonly canEditSend: () => boolean, private readonly publish: (value: DiagnosticSharingSnapshot) => void,
    private readonly clock: () => number = Date.now) {}

  /** Acquire browser resources once after mount. Configuration is explicit;
   * an unconfigured editor gets no prompt, global collector or request. */
  start(): void {
    if (!this.configuration) { this.update(); return }
    try {
      const storage: DiagnosticPreferenceStorage = window.localStorage
      this.repository = new DiagnosticConsentRepository(storage, this.configuration, () => crypto.randomUUID())
      this.choice = this.repository.read().choice; this.storageAvailable = true
      this.queueAvailable = typeof navigator.locks?.request === 'function' && typeof crypto.randomUUID === 'function'
      if (this.queueAvailable) {
        const withLock = async <T,>(work: () => Promise<T>): Promise<T> =>
          await navigator.locks.request('chorono.diagnostics.delivery.v1', work)
        const shared = { configuration: this.configuration, storage, withLock,
          readConsent: () => this.readConsent(), canSend: () => this.canSend(),
          clock: this.clock, fetch: (url: string, options: RequestInit) => fetch(url, options),
          onChange: () => { this.update(); this.schedule() } }
        this.delivery = new DiagnosticDelivery({ ...shared, build: applicationBuildInfo,
          endpoint: this.configuration.endpoint, randomId: () => crypto.randomUUID() })
        this.version = new DiagnosticVersionChecker({ ...shared, currentVersion: applicationBuildInfo.appVersion })
      }
      window.addEventListener('storage', this.onStorage)
      window.addEventListener('online', this.onWake)
      window.addEventListener('pointerdown', this.onDown, true)
      window.addEventListener('pointerup', this.onUp, true)
      window.addEventListener('pointercancel', this.onUp, true)
      window.addEventListener('blur', this.onBlur)
      document.addEventListener('visibilitychange', this.onVisibility)
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel('chorono.diagnostics.consent.v1')
        this.channel.onmessage = event => {
          if (event.data === 'stop') {
            this.blocked = true; this.blockedGeneration = this.lastGeneration
            this.choice = 'denied'; this.stopCollectors(); this.update()
          }
          else if (event.data === 'changed') this.refresh()
        }
      }
      this.refresh()
    } catch { this.storageAvailable = false; this.queueAvailable = false; this.update() }
  }

  /** Persist an explicit UI decision. Revoke aborts first; failure cannot grant
   * transient permission. A stop broadcast also protects other active tabs if
   * storage becomes unavailable while revoking. No prompt appears again after
   * a durable denied/dismissed decision. */
  setConsent(choice: Exclude<DiagnosticConsentChoice, 'unknown'>): void {
    if (!this.repository || this.disposed) return
    this.stopCollectors()
    if (choice !== 'allowed') this.channel?.postMessage('stop')
    try {
      this.repository.write(choice); this.blocked = false; this.blockedGeneration = null; this.choice = choice
      this.channel?.postMessage('changed'); this.refresh()
    } catch {
      this.blocked = true; this.blockedGeneration = this.lastGeneration
      this.choice = 'dismissed'; this.storageAvailable = false
      try { window.localStorage.removeItem(DIAGNOSTIC_CONSENT_KEY) } catch { /* Disabled in this tab. */ }
      this.channel?.postMessage('stop'); this.update()
    }
  }

  /** Feed only a registered code to the permission-gated durable outbox. */
  record(site: DiagnosticFailureSite): void {
    if (!this.disposed && this.readConsent()?.choice === 'allowed') {
      void this.delivery?.record({ failureSite: site }).then(() => this.schedule()).catch(() => this.update())
    }
  }
  /** Explicit settings action; permission and throttling are checked again. */
  async checkVersion(): Promise<void> { if (!this.disposed) await this.version?.check(true) }

  /** Release all owned observers/timers and abort active fetches. Preference,
   * cache and queued reports remain durable; this is not an implicit revoke. */
  dispose(): void {
    this.disposed = true; this.stopCollectors(false)
    window.removeEventListener('storage', this.onStorage); window.removeEventListener('online', this.onWake)
    window.removeEventListener('pointerdown', this.onDown, true); window.removeEventListener('pointerup', this.onUp, true)
    window.removeEventListener('pointercancel', this.onUp, true); window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.channel?.close(); this.channel = undefined
  }

  /** Re-read durable permission for each async boundary; a volatile stop wins. */
  private readConsent() {
    if (this.disposed || this.blocked) return undefined
    try { return this.repository?.read() } catch { return undefined }
  }
  /** Visible/online, no held pointer and no source transaction; no source read. */
  private canSend(): boolean {
    return !this.disposed && !this.pressed && document.visibilityState === 'visible' && navigator.onLine && this.canEditSend()
  }
  /** Apply durable cross-tab decisions; only a newer grant can revive a stop. */
  private refresh(): void {
    if (this.disposed) return
    try {
      const value = this.repository?.read()
      // A newer explicit decision in another tab may release a volatile stop.
      if (this.blocked && value?.choice === 'allowed' && value.generation === this.blockedGeneration) {
        this.choice = 'denied'; this.stopCollectors(); this.update(); return
      }
      this.blocked = false; this.blockedGeneration = null
      this.lastGeneration = value?.generation ?? ''
      this.choice = value?.choice ?? 'unknown'
      if (this.choice === 'allowed' && this.queueAvailable) {
        this.removeSignals?.(); this.removeSignals = subscribeDiagnosticFailures(site => this.record(site))
        window.addEventListener('error', this.onError); window.addEventListener('unhandledrejection', this.onRejection)
        void this.delivery?.restore().then(() => this.schedule()).catch(() => this.update())
        void this.version?.check()
      } else { this.stopCollectors(); void this.delivery?.clear().catch(() => {}) }
    } catch { this.blocked = true; this.storageAvailable = false; this.stopCollectors() }
    this.update()
  }
  /** Release sinks/wake timer and cancel IO; unmount preserves the update cache. */
  private stopCollectors(revoke = true): void {
    if (this.timer) clearTimeout(this.timer); this.timer = undefined
    this.removeSignals?.(); this.removeSignals = undefined
    window.removeEventListener('error', this.onError); window.removeEventListener('unhandledrejection', this.onRejection)
    this.delivery?.cancel()
    if (revoke) this.version?.clear(); else this.version?.cancel()
  }
  /** One future wake only; hidden/offline/dragging work waits for a real event. */
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer); this.timer = undefined
    const due = this.delivery?.getSnapshot().nextAttemptAt
    if (due == null || !this.canSend() || this.readConsent()?.choice !== 'allowed') return
    this.timer = setTimeout(() => { this.timer = undefined
      void this.delivery?.flush().then(() => this.schedule()).catch(() => this.update())
    }, Math.max(1000, due - this.clock()))
  }
  /** Publish counters/permission only, never a report body or trace contents. */
  private update(): void {
    if (this.disposed) return
    this.publish(Object.freeze({ ...EMPTY_DIAGNOSTIC_SHARING, ...this.delivery?.getSnapshot(),
      ...this.version?.getSnapshot(), ready: true, configured: Boolean(this.configuration),
      configuration: this.configuration, choice: this.choice,
      storageAvailable: this.storageAvailable, queueAvailable: this.queueAvailable }))
  }
  /** Observe another tab's durable decisions/outbox without trusting event data. */
  private readonly onStorage = (event: StorageEvent) => {
    if (event.key === DIAGNOSTIC_CONSENT_KEY || event.key === null) this.refresh()
    else if (event.key === 'chorono.diagnostics.outbox.v1' && this.choice === 'allowed') {
      void this.delivery?.restore().then(() => this.schedule()).catch(() => {})
    }
  }
  /** Recheck the durable gates after connectivity/visibility changes. */
  private readonly onWake = () => { this.schedule(); if (this.choice === 'allowed') void this.version?.check() }
  /** Hidden pages abort IO and never run an unload beacon. */
  private readonly onVisibility = () => { if (document.hidden) { this.delivery?.cancel(); this.version?.cancel() } this.onWake() }
  /** A held pointer suspends the pending wake without touching editor handlers. */
  private readonly onDown = () => { this.pressed = true; if (this.timer) clearTimeout(this.timer); this.timer = undefined }
  /** Defer eligibility until all native pointer-up commit handlers have run. */
  private readonly onUp = () => { this.pressed = false; queueMicrotask(() => this.schedule()) }
  /** Release held-pointer bookkeeping and abort work on lost window focus. */
  private readonly onBlur = () => { this.pressed = false; this.delivery?.cancel(); this.version?.cancel(); this.schedule() }
  /** Never inspect the event's potentially private message/stack/source fields. */
  private readonly onError = () => this.record('application.unhandled-error')
  /** Never inspect rejection reason; the generic bucket remains unclassified. */
  private readonly onRejection = () => this.record('application.unhandled-rejection')
}

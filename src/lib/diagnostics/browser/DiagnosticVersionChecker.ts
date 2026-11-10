import { compareSemanticVersions, createBuildInfo } from '@/lib/version'
import { BoundedBinaryReader } from '@/lib/resources/io'
import type { DiagnosticConsent, DiagnosticPreferenceStorage } from '../consent/DiagnosticConsentRepository'
import type { DiagnosticSharingConfiguration } from '../consent/configuration'

export interface DiagnosticVersionSnapshot {
  readonly latestVersion: string | null
  readonly notesUrl: string | null
  readonly versionStatus: 'idle' | 'checking' | 'current' | 'available' | 'failed'
}
interface Options {
  configuration: DiagnosticSharingConfiguration
  currentVersion: string
  readConsent(): DiagnosticConsent | undefined
  storage: DiagnosticPreferenceStorage
  withLock<T>(work: () => Promise<T>): Promise<T>
  fetch(input: string, init: RequestInit): Promise<Response>
  canSend(): boolean
  clock?: () => number
  onChange?: () => void
}
const KEY = 'chorono.diagnostics.version.v1', DAY = 24 * 60 * 60 * 1000

/** Consent-gated version manifest reader, independent of the error queue.
 * One shared browser lock/cache bounds checks to once a day across tabs. No
 * installed version, project data or identifier is sent. Generation guards
 * prevent late responses from restoring revoked state. Owns only its active
 * AbortController/timeout; dispose/revoke calls clear. Remote strings are
 * bounded/validated before becoming UI text/link. No automatic installation. */
export class DiagnosticVersionChecker {
  private snapshot: DiagnosticVersionSnapshot = Object.freeze({ latestVersion: null, notesUrl: null, versionStatus: 'idle' })
  private active?: AbortController
  private readonly clock: () => number
  private readonly reader = new BoundedBinaryReader({ maxBytes: 4096 })

  /** Borrow platform ports; construction performs no IO or permission lookup. */
  constructor(private readonly options: Options) { this.clock = options.clock ?? Date.now }
  /** Immutable UI metadata; reading never initiates an update check. */
  readonly getSnapshot = (): DiagnosticVersionSnapshot => this.snapshot

  /** Read cached or fresh release information only while permission is active.
   * `force` is the explicit Check now action; automatic checks honor24h cache.
   * Network/cache failures become a safe status and never escape into editing. */
  async check(force = false): Promise<void> {
    try {
      await this.options.withLock(async () => {
        const consent = this.options.readConsent()
        if (!this.allowed(consent) || !this.options.canSend()) return
        const now = this.clock()
        if (!Number.isSafeInteger(now) || now < 0) return
        const cached = this.readCache(consent.generation)
        if (cached && now < cached.checkedAt) return
        if (cached && (now - cached.checkedAt < 60000 || (!force && now - cached.checkedAt < DAY))) {
          this.publish(cached.version, cached.notesUrl); return
        }
        this.set({ ...this.snapshot, versionStatus: 'checking' })
        const controller = new AbortController(); this.active = controller
        const timeout = setTimeout(() => controller.abort(), 10000)
        try {
          if (!this.same(consent)) return
          // Cache the attempt before IO as well as successes. Reload/visibility
          // changes cannot turn a failing service into an automatic request loop.
          this.options.storage.setItem(KEY, JSON.stringify({ schemaVersion: 1,
            generation: consent.generation, endpoint: consent.endpoint, checkedAt: now,
            version: null, notesUrl: null }))
          if (!this.same(consent)) return
          const response = await this.options.fetch(this.options.configuration.versionEndpoint, { method: 'GET',
            credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store',
            headers: { 'X-Chorono-Diagnostics-Policy': 'summary-v1' }, signal: controller.signal })
          let release: { version: string | null; notesUrl: string | null } = { version: null, notesUrl: null }
          if (response.status !== 204) {
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw Error('Invalid version response')
            const lease = await this.reader.readResponse(response, { signal: controller.signal })
            try { release = parseRelease(JSON.parse(new TextDecoder().decode(lease.buffer))) }
            finally { lease.release() }
          }
          if (controller.signal.aborted || !this.same(consent)) return
          this.options.storage.setItem(KEY, JSON.stringify({ schemaVersion: 1,
            generation: consent.generation, endpoint: consent.endpoint, checkedAt: now, ...release }))
          this.publish(release.version, release.notesUrl)
        } catch {
          if (this.same(consent)) this.set({ ...this.snapshot, versionStatus: 'failed' })
        } finally { clearTimeout(timeout); if (this.active === controller) this.active = undefined }
      })
    } catch { this.set({ ...this.snapshot, versionStatus: 'failed' }) }
  }

  /** Abort synchronously; removing local cache is best effort. Never cancels
   * editing or revives a late network result. Caller already revoked consent. */
  clear(): void {
    this.active?.abort(); this.active = undefined
    try { this.options.storage.removeItem(KEY) } catch { /* Fail closed without cache. */ }
    this.set({ latestVersion: null, notesUrl: null, versionStatus: 'idle' })
  }

  /** Abort a lifecycle interruption without deleting the durable daily cache. */
  cancel(): void { this.active?.abort(); this.active = undefined }

  /** Match the same report-sharing policy and configured destination. */
  private allowed(value: DiagnosticConsent | undefined): value is DiagnosticConsent {
    return value?.choice === 'allowed' && value.endpoint === this.options.configuration.endpoint && value.policyVersion === 'summary-v1'
  }
  /** Reject late work after revocation or a changed local permission epoch. */
  private same(value: DiagnosticConsent): boolean {
    try { const current = this.options.readConsent(); return this.allowed(current) && current.generation === value.generation }
    catch { return false }
  }
  /** Read bounded per-permission cache; corrupted/other-target metadata is inert. */
  private readCache(generation: string): { version: string | null; notesUrl: string | null; checkedAt: number } | undefined {
    try {
      const raw = this.options.storage.getItem(KEY)
      if (!raw || raw.length > 4096) return
      const value = JSON.parse(raw)
      if (value.schemaVersion !== 1 || value.generation !== generation || value.endpoint !== this.options.configuration.endpoint ||
        !Number.isSafeInteger(value.checkedAt) || value.checkedAt < 0) return
      const release = value.version === null && value.notesUrl === null ? { version: null, notesUrl: null } : parseRelease(value)
      return { ...release, checkedAt: value.checkedAt }
    } catch { return undefined }
  }
  /** Compare locally, so the installed version is never a request parameter. */
  private publish(version: string | null, notesUrl: string | null): void {
    this.set({ latestVersion: version, notesUrl, versionStatus: version === null ? 'idle' :
      compareSemanticVersions(version, this.options.currentVersion) > 0 ? 'available' : 'current' })
  }
  /** Isolate UI observer failures from consent and request cleanup. */
  private set(value: DiagnosticVersionSnapshot): void {
    this.snapshot = Object.freeze(value)
    try { this.options.onChange?.() } catch { /* UI observers cannot affect permission. */ }
  }
}

/** Allow only a valid version and a public HTTPS release-notes URL. */
function parseRelease(value: unknown): { version: string; notesUrl: string | null } {
  if (!value || typeof value !== 'object') throw Error('Invalid release')
  const record = value as Record<string, unknown>
  if (typeof record.version !== 'string') throw Error('Invalid release')
  createBuildInfo(record.version)
  let notesUrl: string | null = null
  if (record.notesUrl !== null && record.notesUrl !== undefined) {
    if (typeof record.notesUrl !== 'string' || record.notesUrl.length > 512) throw Error('Invalid release URL')
    const url = new URL(record.notesUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('Invalid release URL')
    notesUrl = url.href
  }
  return { version: record.version, notesUrl }
}

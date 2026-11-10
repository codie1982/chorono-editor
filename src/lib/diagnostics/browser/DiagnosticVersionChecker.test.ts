import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticVersionChecker } from './DiagnosticVersionChecker'
import { createDiagnosticConfiguration } from '../consent/configuration'
import type { DiagnosticConsent } from '../consent/DiagnosticConsentRepository'

const configuration = createDiagnosticConfiguration('http://127.0.0.1:2000/api/diagnostics/reports', 'QA')!
function setup() {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  let consent: DiagnosticConsent = { choice: 'unknown', generation: 'first', endpoint: configuration.endpoint, policyVersion: 'summary-v1' }
  let now = Date.UTC(2026, 10, 10)
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ version: '0.3.0', notesUrl: 'https://example.test/releases/v0.3.0' }))
  const options = { configuration, currentVersion: '0.2.0', storage, fetch, readConsent: () => consent,
    canSend: () => true, withLock: async <T,>(work: () => Promise<T>) => await work(), clock: () => now }
  return { checker: new DiagnosticVersionChecker(options), options, values, fetch,
    allow: () => { consent = { ...consent, choice: 'allowed' } },
    revoke: () => { consent = { ...consent, choice: 'denied', generation: 'second' } },
    advance: (milliseconds = 86400000) => { now += milliseconds } }
}
afterEach(() => vi.restoreAllMocks())
describe('consent-gated update checks', () => {
  it('makes no request without allowed permission, even for Check now', async () => {
    const h = setup(); await h.checker.check(); await h.checker.check(true)
    expect(h.fetch).not.toHaveBeenCalled(); expect(h.values.size).toBe(0)
  })
  it('reads one manifest per day across reconstructed owners and sends no installed version', async () => {
    const h = setup(); h.allow(); await h.checker.check()
    expect(h.checker.getSnapshot()).toMatchObject({ latestVersion: '0.3.0', versionStatus: 'available' })
    const [url, init] = h.fetch.mock.calls[0]
    expect(url).toBe(configuration.versionEndpoint); expect(url).not.toContain('0.2.0')
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' })
    await new DiagnosticVersionChecker(h.options).check(); expect(h.fetch).toHaveBeenCalledTimes(1)
    h.advance(); await h.checker.check(); expect(h.fetch).toHaveBeenCalledTimes(2)
  })
  it('throttles automatic failure checks across reload but permits explicit Check now', async () => {
    const h = setup(); h.allow(); h.fetch.mockRejectedValue(new Error('offline'))
    await h.checker.check(); expect(h.checker.getSnapshot().versionStatus).toBe('failed')
    await new DiagnosticVersionChecker(h.options).check(); expect(h.fetch).toHaveBeenCalledTimes(1)
    await h.checker.check(true); expect(h.fetch).toHaveBeenCalledTimes(1)
    h.advance(60000); await h.checker.check(true); expect(h.fetch).toHaveBeenCalledTimes(2)
  })
  it('does not request again after a backwards clock change', async () => {
    const h = setup(); h.allow(); await h.checker.check(); h.advance(-1000)
    await h.checker.check(true); expect(h.fetch).toHaveBeenCalledTimes(1)
  })
  it('aborts and cannot publish/persist late responses after revoke', async () => {
    const h = setup(); h.allow()
    let finish!: (value: Response) => void
    h.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = h.checker.check(); await Promise.resolve()
    h.revoke(); h.checker.clear()
    expect(h.fetch.mock.calls[0][1].signal?.aborted).toBe(true)
    finish(Response.json({ version: '99.0.0', notesUrl: null })); await pending
    expect(h.checker.getSnapshot().latestVersion).toBeNull(); expect(h.values.size).toBe(0)
  })
  it('rejects unsafe links, invalid versions and oversized response bodies', async () => {
    for (const payload of [{ version: 'bad', notesUrl: null }, { version: '0.3.0', notesUrl: 'javascript:alert(1)' },
      { version: '0.3.0', notesUrl: 'https://example.test/release?secret=x' }, { version: '0.3.0', extra: 'x'.repeat(5000) }]) {
      const h = setup(); h.allow(); h.fetch.mockResolvedValue(Response.json(payload))
      await h.checker.check(); expect(h.checker.getSnapshot().versionStatus).toBe('failed')
      expect(h.checker.getSnapshot().latestVersion).toBeNull()
    }
  })
  it('supports an enabled service without a configured release and offline gating', async () => {
    const h = setup(); h.allow(); h.fetch.mockResolvedValue(new Response(null, { status: 204 }))
    await h.checker.check(); expect(h.checker.getSnapshot().versionStatus).toBe('idle')
    const offline = new DiagnosticVersionChecker({ ...h.options, canSend: () => false })
    await offline.check(true); expect(h.fetch).toHaveBeenCalledTimes(1)
  })
})

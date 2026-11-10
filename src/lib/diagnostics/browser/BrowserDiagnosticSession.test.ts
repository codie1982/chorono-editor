import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserDiagnosticSession } from './BrowserDiagnosticSession'
import { EMPTY_DIAGNOSTIC_SHARING, type DiagnosticSharingSnapshot } from './types'
import { createDiagnosticConfiguration } from '../consent/configuration'
import { DiagnosticConsentRepository, DIAGNOSTIC_CONSENT_KEY } from '../consent/DiagnosticConsentRepository'
import { reportDiagnosticFailure } from './failureSignals'

const configuration = createDiagnosticConfiguration('http://127.0.0.1:2000/api/diagnostics/reports', 'QA')!
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
function setup() {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const win = Object.assign(new EventTarget(), { localStorage: storage })
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible', hidden: false })
  let nextId = 0
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc); vi.stubGlobal('BroadcastChannel', undefined)
  vi.stubGlobal('crypto', { randomUUID: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}` })
  vi.stubGlobal('navigator', { onLine: true, locks: { request: async (_: string, work: () => Promise<unknown>) => await work() } })
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === 'GET') return Response.json({ version: '0.3.0', notesUrl: null })
    const report = JSON.parse(String(init.body)); return Response.json({ accepted: true, duplicate: false, reportId: report.reportId })
  })
  vi.stubGlobal('fetch', fetch)
  let snapshot: DiagnosticSharingSnapshot = EMPTY_DIAGNOSTIC_SHARING
  const session = new BrowserDiagnosticSession(configuration, () => true, value => { snapshot = value })
  return { values, storage, win, doc, fetch, session, snapshot: () => snapshot }
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-10T00:00:00Z')) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('browser diagnostic ownership', () => {
  it('does not send or retain errors before consent and persists denial across reopening', async () => {
    const h = setup(); h.session.start(); h.win.dispatchEvent(new Event('error'))
    reportDiagnosticFailure('viewport.object-move.commit'); await settle()
    expect(h.fetch).not.toHaveBeenCalled(); expect(h.snapshot().choice).toBe('unknown')
    h.session.setConsent('denied'); await settle(); h.session.dispose()
    const next = new BrowserDiagnosticSession(configuration, () => true, value => { expect(value.choice).toBe('denied') })
    next.start(); await settle(); expect(h.fetch).not.toHaveBeenCalled(); next.dispose()
  })
  it('sends safe deltas only after consent and stops collector/timers on revoke', async () => {
    const h = setup(); h.session.start(); h.session.setConsent('allowed'); await settle()
    expect(h.fetch.mock.calls.filter(([, init]) => init.method === 'GET')).toHaveLength(1)
    const rawGetter = vi.fn(() => { throw Error('private') }), event = new Event('error')
    Object.defineProperty(event, 'error', { get: rawGetter })
    h.win.dispatchEvent(event); reportDiagnosticFailure('viewport.object-move.commit'); await settle()
    expect(rawGetter).not.toHaveBeenCalled(); expect(h.snapshot().queued).toBe(2)
    await vi.advanceTimersByTimeAsync(301000)
    expect(h.fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
    h.session.setConsent('denied'); await settle()
    h.win.dispatchEvent(new Event('error')); await vi.advanceTimersByTimeAsync(600000)
    expect(h.fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(1)
    expect(h.snapshot().choice).toBe('denied'); h.session.dispose()
  })
  it('observes revocation from another tab before any later signal', async () => {
    const h = setup(); h.session.start(); h.session.setConsent('allowed'); await settle()
    const other = new DiagnosticConsentRepository(h.storage, configuration, () => '35dd0a72-388a-440b-98dc-b34411389502')
    other.write('denied')
    const event = Object.assign(new Event('storage'), { key: DIAGNOSTIC_CONSENT_KEY })
    h.win.dispatchEvent(event); await settle(); reportDiagnosticFailure('viewport.object-move.commit'); await settle()
    expect(h.snapshot().choice).toBe('denied'); expect(h.snapshot().queued).toBe(0)
    expect(h.fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0)
    h.session.dispose()
  })
  it('stays unavailable rather than enabling unsafe delivery without browser locks', () => {
    const h = setup(); vi.stubGlobal('navigator', { onLine: true })
    h.session.start(); expect(h.snapshot().queueAvailable).toBe(false); expect(h.fetch).not.toHaveBeenCalled()
    h.session.dispose()
  })
  it('does not revive a stopped consent generation on delayed cross-tab notifications', async () => {
    const h = setup()
    let receive: ((event: { data: string }) => void) | undefined
    vi.stubGlobal('BroadcastChannel', class {
      set onmessage(value: (event: { data: string }) => void) { receive = value }
      postMessage() {}
      close() {}
    })
    h.session.start(); h.session.setConsent('allowed'); await settle()
    receive!({ data: 'stop' }); receive!({ data: 'changed' })
    h.win.dispatchEvent(Object.assign(new Event('storage'), { key: DIAGNOSTIC_CONSENT_KEY })); await settle()
    reportDiagnosticFailure('viewport.object-move.commit'); await settle()
    expect(h.snapshot().choice).toBe('denied'); expect(h.snapshot().queued).toBe(0)
    expect(h.fetch).toHaveBeenCalledTimes(1)
    const other = new DiagnosticConsentRepository(h.storage, configuration, () => '35dd0a72-388a-440b-98dc-b34411389502')
    other.write('allowed'); receive!({ data: 'changed' }); await settle()
    expect(h.snapshot().choice).toBe('allowed')
    expect(h.fetch).toHaveBeenCalledTimes(2); h.session.dispose()
  })
  it('does not touch storage/network in an unconfigured editor', () => {
    const h = setup(), session = new BrowserDiagnosticSession(null, () => true, () => {})
    session.start(); expect(h.values.size).toBe(0); expect(h.fetch).not.toHaveBeenCalled(); session.dispose()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createBuildInfo } from '@/lib/version'
import { DiagnosticDelivery } from './DiagnosticDelivery'
import { DIAGNOSTIC_DELIVERY_INTERVAL_MS, DIAGNOSTIC_OUTBOX_KEY, DIAGNOSTIC_OUTBOX_MAX_BYTES,
  DIAGNOSTIC_OUTBOX_TTL_MS, type DiagnosticDeliveryConsent, type DiagnosticDeliveryOptions } from './types'

const endpoint = 'http://127.0.0.1:2000/api/diagnostics/reports'
const start = Date.UTC(2026, 10, 10, 8)
const failure = { failureSite: 'viewport.object-move.commit' }

/** Shared browser-like storage/lock. Ports are explicit; tests never invoke
 * ambient fetch or browser persistence and can simulate independent tabs. */
function harness(allowed = true) {
  const data = new Map<string, string>()
  const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
    removeItem: vi.fn((key: string) => { data.delete(key) }) }
  let consent: DiagnosticDeliveryConsent = { choice: allowed ? 'allowed' : 'unknown',
    endpoint, generation: 'generation-1', policyVersion: 'summary-v1' }
  let now = start, serial = 0, sendable = true
  let tail: Promise<unknown> = Promise.resolve()
  const withLock = <T,>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work)
    tail = result.catch(() => {})
    return result
  }
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    const report = JSON.parse(options.body as string)
    return new Response(JSON.stringify({ accepted: true, reportId: report.reportId, duplicate: false }),
      { headers: { 'Content-Type': 'application/json' } })
  })
  const options: DiagnosticDeliveryOptions = { build: createBuildInfo('0.2.0'), endpoint, readConsent: () => consent,
    storage, withLock, fetch: fetcher, randomId: () => `${(++serial).toString(16).padStart(8, '0')}-1111-4111-8111-000000000000`,
    clock: () => now, canSend: () => sendable }
  const delivery = new DiagnosticDelivery(options)
  return { delivery, options, storage, data, fetcher,
    create: () => new DiagnosticDelivery(options),
    setConsent: (next: Partial<DiagnosticDeliveryConsent>) => { consent = { ...consent, ...next } },
    setTime: (next: number) => { now = next }, advance: (amount = DIAGNOSTIC_DELIVERY_INTERVAL_MS) => { now += amount },
    setSendable: (next: boolean) => { sendable = next },
    state: () => JSON.parse(data.get(DIAGNOSTIC_OUTBOX_KEY)!),
  }
}

describe('consent-bound diagnostic delivery', () => {
  it('does nothing before consent, including conversion/getters, storage and fetch', async () => {
    const h = harness(false), getter = vi.fn(() => 'viewport.object-move.commit')
    await h.delivery.restore(); await h.delivery.record({ get failureSite() { return getter() } }); await h.delivery.flush()
    expect(getter).not.toHaveBeenCalled(); expect(h.storage.getItem).not.toHaveBeenCalled()
    expect(h.storage.setItem).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled()
    expect(h.delivery.getSnapshot().queued).toBe(0)
  })

  it('ignores ordinary interaction/cancel input instead of manufacturing errors', async () => {
    const h = harness()
    for (const reason of ['native:blur', 'native:escape', 'no-source-change', 'below-drag-threshold']) {
      await h.delivery.record({ owner: 'object-move', event: 'source-cancel', details: { reason } })
    }
    expect(h.storage.setItem).not.toHaveBeenCalled(); expect(h.fetcher).not.toHaveBeenCalled()
  })

  it('groups 1,000 repeats into one clean persisted count with no raw caller fields', async () => {
    const h = harness(), secret = '/Users/private/project/token'
    for (let n = 0; n < 1000; n++) await h.delivery.record({ ...failure, message: secret, error: new Error(secret), x: 100 })
    expect(h.delivery.getSnapshot().queued).toBe(1)
    expect(h.state().items[0].report.occurrenceCount).toBe(1000)
    expect(h.data.get(DIAGNOSTIC_OUTBOX_KEY)).not.toContain(secret)
    expect(h.fetcher).not.toHaveBeenCalled()
    const tab = h.create(); await tab.restore(); expect(tab.getSnapshot().queued).toBe(1)
  })

  it('caps the daily catalogue at 20 groups and counts overflow without retaining sites', async () => {
    const h = harness()
    for (const tool of ['object-move', 'object-rotate', 'object-scale', 'object-anchor', 'object-resize', 'guide', 'shape-placement', 'motion-key']) {
      for (const stage of ['preview', 'commit', 'rollback']) await h.delivery.record({ failureSite: `viewport.${tool}.${stage}` })
    }
    for (const site of ['unhandled-error', 'unhandled-rejection', 'render-failed']) {
      await h.delivery.record({ failureSite: `application.${site}` })
    }
    expect(h.delivery.getSnapshot()).toMatchObject({ queued: 20, dropped: 7 })
    expect(h.state().seen).toHaveLength(20)
  })

  it('sends only after five minutes with safe transport headers and an exact ACK', async () => {
    const h = harness(); await h.delivery.record(failure); await h.delivery.flush()
    expect(h.fetcher).not.toHaveBeenCalled()
    h.advance(); await h.delivery.flush()
    expect(h.fetcher).toHaveBeenCalledTimes(1)
    const [url, options] = h.fetcher.mock.calls[0]
    expect(url).toBe(endpoint)
    expect(options).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
      redirect: 'error', keepalive: false, headers: { 'Content-Type': 'application/json', 'X-Chorono-Diagnostics-Policy': 'summary-v1' } })
    expect(h.delivery.getSnapshot()).toMatchObject({ queued: 0, lastOutcome: 'sent', nextAttemptAt: null })
  })

  it('freezes a failed count delta and ID while new occurrences form the next batch', async () => {
    const h = harness(); h.fetcher.mockResolvedValueOnce(new Response('', { status: 503 }))
    await h.delivery.record(failure); await h.delivery.record(failure); h.advance(); await h.delivery.flush()
    const firstBody = h.fetcher.mock.calls[0][1].body
    await h.delivery.record(failure)
    expect(h.state().items.map((item: any) => item.report.occurrenceCount)).toEqual([2, 1])
    expect(h.state().items[0].attempts).toBe(1)
    h.advance(DIAGNOSTIC_DELIVERY_INTERVAL_MS + 1000); await h.delivery.flush()
    expect(h.fetcher.mock.calls[1][1].body).toBe(firstBody)
    expect(h.delivery.getSnapshot().queued).toBe(1)
    expect(h.state().items[0].report.occurrenceCount).toBe(1)
  })

  it('honors Retry-After and never exceeds five attempts', async () => {
    const h = harness(); h.fetcher.mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '1200' } }))
    await h.delivery.record(failure); h.advance(); await h.delivery.flush()
    expect(h.delivery.getSnapshot().nextAttemptAt).toBe(start + 25 * 60 * 1000)
    for (let attempt = 1; attempt < 5; attempt++) {
      h.setTime(h.delivery.getSnapshot().nextAttemptAt! + 1); await h.delivery.flush()
    }
    expect(h.fetcher).toHaveBeenCalledTimes(5)
    expect(new Set(h.fetcher.mock.calls.map(call => call[1].body)).size).toBe(1)
    expect(h.delivery.getSnapshot()).toMatchObject({ queued: 0, dropped: 1, lastOutcome: 'failed' })
  })

  it('drops permanent 4xx but retries malformed/oversized acknowledgement responses', async () => {
    const h = harness(); h.fetcher.mockResolvedValueOnce(new Response('', { status: 400 }))
    await h.delivery.record(failure); h.advance(); await h.delivery.flush()
    expect(h.delivery.getSnapshot()).toMatchObject({ queued: 0, dropped: 1, lastOutcome: 'failed' })
    h.fetcher.mockResolvedValueOnce(new Response('x'.repeat(2000)))
    await h.delivery.record(failure); h.advance(); await h.delivery.flush()
    expect(h.delivery.getSnapshot()).toMatchObject({ queued: 1, lastOutcome: 'retrying' })
  })

  it('does not send while offline, hidden or in an active editor gesture', async () => {
    const h = harness(); await h.delivery.record(failure); h.advance(); h.setSendable(false)
    await h.delivery.flush(); expect(h.fetcher).not.toHaveBeenCalled()
    h.setSendable(true); await h.delivery.flush(); expect(h.fetcher).toHaveBeenCalledTimes(1)
  })

  it('expires 24-hour queued reports and permits fresh groups on the next UTC day', async () => {
    const h = harness(); await h.delivery.record(failure)
    h.advance(DIAGNOSTIC_OUTBOX_TTL_MS); await h.delivery.restore()
    expect(h.delivery.getSnapshot()).toMatchObject({ queued: 0, dropped: 1 })
    await h.delivery.record(failure)
    expect(h.state().items[0].report.day).toBe('2026-11-11')
    expect(h.state().items[0].report.occurrenceCount).toBe(1)
  })

  it('resets malformed/oversized stored state rather than sending it', async () => {
    const h = harness(); h.data.set(DIAGNOSTIC_OUTBOX_KEY, 'x'.repeat(DIAGNOSTIC_OUTBOX_MAX_BYTES + 1))
    await h.delivery.restore(); expect(h.delivery.getSnapshot().queued).toBe(0)
    expect(h.fetcher).not.toHaveBeenCalled(); expect(h.storage.removeItem).toHaveBeenCalled()
    await h.delivery.record(failure)
    const raw = h.state(); raw.items[0].report.message = 'private data'
    h.data.set(DIAGNOSTIC_OUTBOX_KEY, JSON.stringify(raw)); h.advance(); await h.delivery.flush()
    expect(h.fetcher).not.toHaveBeenCalled(); expect(h.delivery.getSnapshot().queued).toBe(0)
  })

  it('fails closed when persistence fails, never treating a volatile report as durable', async () => {
    const h = harness(); h.storage.setItem.mockImplementation(() => { throw new Error('quota') })
    await h.delivery.record(failure); h.advance(); await h.delivery.flush()
    expect(h.fetcher).not.toHaveBeenCalled(); expect(h.delivery.getSnapshot().lastOutcome).toBe('failed')
  })

  it('serializes two tab senders through the host lock and ACKs only once', async () => {
    const h = harness(), second = h.create(); await h.delivery.record(failure); await second.restore(); h.advance()
    await Promise.all([h.delivery.flush(), second.flush()])
    expect(h.fetcher).toHaveBeenCalledTimes(1)
    expect(h.delivery.getSnapshot().queued).toBe(0); expect(second.getSnapshot().queued).toBe(0)
  })

  it('aborts revoke promptly and ignores late ACK without reviving a queue', async () => {
    const h = harness()
    let release!: (response: Response) => void, started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    h.fetcher.mockImplementationOnce(async () => { started(); return new Promise(resolve => { release = resolve }) })
    await h.delivery.record(failure); h.advance(); const flushing = h.delivery.flush(); await ready
    const sent = JSON.parse(h.fetcher.mock.calls[0][1].body as string)
    h.setConsent({ choice: 'denied', generation: 'generation-2' }); h.delivery.cancel()
    expect(h.fetcher.mock.calls[0][1].signal?.aborted).toBe(true)
    release(new Response(JSON.stringify({ accepted: true, reportId: sent.reportId, duplicate: false })))
    await flushing; await h.delivery.clear()
    expect(h.data.has(DIAGNOSTIC_OUTBOX_KEY)).toBe(false)
    expect(h.delivery.getSnapshot().queued).toBe(0)
    h.advance(); await h.delivery.flush(); expect(h.fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not erase a newly allowed generation during stale revoke cleanup', async () => {
    const h = harness(); await h.delivery.record(failure)
    h.setConsent({ generation: 'generation-2' })
    const second = h.create(); await second.restore(); await second.record({ failureSite: 'viewport.guide.commit' })
    const current = h.data.get(DIAGNOSTIC_OUTBOX_KEY)
    await h.delivery.clear()
    expect(h.data.get(DIAGNOSTIC_OUTBOX_KEY)).toBe(current)
    expect(h.state().generation).toBe('generation-2')
  })

  it('does not admit a waiting old-generation occurrence after revoke and re-allow', async () => {
    const h = harness()
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    const holding = h.options.withLock(async () => { await wait })
    const waiting = h.delivery.record(failure)
    h.setConsent({ generation: 'generation-2' }); release()
    await holding; await waiting
    expect(h.data.has(DIAGNOSTIC_OUTBOX_KEY)).toBe(false)
    await h.delivery.record(failure)
    expect(h.state().items[0].report.occurrenceCount).toBe(1)
  })

  it('bounds records waiting for an inter-tab lock during an error storm', async () => {
    const h = harness()
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    const holding = h.options.withLock(async () => { await wait })
    const pending = Array.from({ length: 1000 }, () => h.delivery.record(failure))
    release(); await holding; await Promise.all(pending)
    expect(h.state().items[0].report.occurrenceCount).toBe(200)
    expect(h.delivery.getSnapshot()).toMatchObject({ queued: 1, dropped: 800 })
  })

  it('does not erase an outbox belonging to another configured endpoint', async () => {
    const h = harness(); await h.delivery.record(failure)
    const state = h.state(); state.endpoint = 'https://collector.example/api/diagnostics/reports'; state.generation = 'other'
    h.data.set(DIAGNOSTIC_OUTBOX_KEY, JSON.stringify(state)); h.setConsent({ choice: 'unknown' })
    await h.delivery.clear(); expect(h.state().endpoint).toBe(state.endpoint)
  })

  it('keeps endpoint/build configuration copied and ignores invalid/backward clocks', async () => {
    const h = harness(); (h.options as any).endpoint = 'https://wrong.example/api/diagnostics/reports'
    await h.delivery.record(failure)
    const snapshot = h.delivery.getSnapshot(), raw = h.data.get(DIAGNOSTIC_OUTBOX_KEY)
    h.setTime(start - 1); await h.delivery.record(failure)
    expect(h.delivery.getSnapshot()).toBe(snapshot); expect(h.data.get(DIAGNOSTIC_OUTBOX_KEY)).toBe(raw)
    h.setTime(NaN); await h.delivery.flush(); expect(h.fetcher).not.toHaveBeenCalled()
    h.setTime(start + DIAGNOSTIC_DELIVERY_INTERVAL_MS); await h.delivery.flush()
    expect(h.fetcher.mock.calls[0][0]).toBe(endpoint)
  })

  it('rejects unsafe endpoint configuration', () => {
    const h = harness()
    for (const target of ['http://public.example/api', 'https://user:secret@collector.example/api',
      'https://collector.example/api?token=secret', 'https://collector.example/api#private']) {
      expect(() => new DiagnosticDelivery({ ...h.options, endpoint: target })).toThrow(RangeError)
    }
  })

  it('caps item admission and saturates occurrence counts without overflowing', async () => {
    const h = harness(); await h.delivery.record(failure)
    const state = h.state(), first = state.items[0]
    first.report.occurrenceCount = 1_000_000
    h.data.set(DIAGNOSTIC_OUTBOX_KEY, JSON.stringify(state))
    await h.delivery.record(failure)
    expect(h.state().items[0].report.occurrenceCount).toBe(1_000_000)
    expect(h.delivery.getSnapshot().dropped).toBe(1)
    const full = h.state()
    full.items = Array.from({ length: 200 }, (_, i) => ({ ...first, attempts: 1,
      report: { ...first.report, reportId: `${(1000 + i).toString(16).padStart(8, '0')}-1111-4111-8111-000000000000` } }))
    h.data.set(DIAGNOSTIC_OUTBOX_KEY, JSON.stringify(full))
    await h.delivery.record({ failureSite: 'viewport.guide.commit' })
    expect(h.delivery.getSnapshot()).toMatchObject({ queued: 200, dropped: 2 })
    expect(new TextEncoder().encode(h.data.get(DIAGNOSTIC_OUTBOX_KEY)).byteLength).toBeLessThanOrEqual(DIAGNOSTIC_OUTBOX_MAX_BYTES)
  })

  it('does not perform a sixth attempt after a crash during the final persisted attempt', async () => {
    const h = harness(); await h.delivery.record(failure)
    const state = h.state(); state.items[0].attempts = 5
    h.data.set(DIAGNOSTIC_OUTBOX_KEY, JSON.stringify(state)); h.advance()
    const reloaded = h.create(); await reloaded.restore(); await reloaded.flush()
    expect(reloaded.getSnapshot()).toMatchObject({ queued: 0, dropped: 1 })
    expect(h.fetcher).not.toHaveBeenCalled()
  })

  it('aborts a timed-out native request and releases its timer before retry', async () => {
    vi.useFakeTimers()
    try {
      const h = harness()
      let started!: () => void
      const ready = new Promise<void>(resolve => { started = resolve })
      h.fetcher.mockImplementationOnce(async (_url, options) => {
        started()
        return new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
      })
      await h.delivery.record(failure); h.advance(); const pending = h.delivery.flush(); await ready
      await vi.advanceTimersByTimeAsync(10_000); await pending
      expect(h.fetcher.mock.calls[0][1].signal?.aborted).toBe(true)
      expect(h.delivery.getSnapshot()).toMatchObject({ queued: 1, lastOutcome: 'retrying' })
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})

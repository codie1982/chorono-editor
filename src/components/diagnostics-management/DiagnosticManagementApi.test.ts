import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticManagementApi, DiagnosticManagementError } from './DiagnosticManagementApi'
import { readManagementIssue, readManagementPage } from './managementResponse'
import { issueFixture, pageFixture } from './managementFixture'

afterEach(() => { vi.useRealTimers() })
describe('management wire adapter', () => {
  it('puts the secret only in Authorization and uses credential-free fixed endpoints', async () => {
    const fetch = vi.fn(async () => Response.json(pageFixture())), api = new DiagnosticManagementApi(fetch, () => 'http://127.0.0.1:2000')
    await api.list('PRIVATE_TOKEN', { status: 'new', limit: 50 }, new AbortController().signal)
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/diagnostics/issues?status=new&limit=50'); expect(url).not.toContain('PRIVATE_TOKEN')
    expect(options).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store', headers: { Authorization: 'Bearer PRIVATE_TOKEN' } })
  })
  it('sends the exact CAS body and reconstructs a code-only updated row', async () => {
    const fetch = vi.fn(async () => Response.json({ issue: issueFixture('fixed', 1) })), api = new DiagnosticManagementApi(fetch, () => 'http://127.0.0.1:2000')
    const updated = await api.update('token', issueFixture().key, 'fixed', 0, new AbortController().signal)
    const [, options] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(options.body))).toEqual({ key: issueFixture().key, status: 'fixed', expectedRevision: 0 })
    expect(updated.status).toBe('fixed'); expect(Object.isFrozen(updated)).toBe(true)
  })
  it('rejects oversized/malformed responses and does not expose error bodies', async () => {
    const invalid = new DiagnosticManagementApi(async () => Response.json({ ...pageFixture(), items: new Array(101).fill(issueFixture()) }), () => 'http://127.0.0.1:2000')
    await expect(invalid.list('token', {}, new AbortController().signal)).rejects.toThrow()
    const oversized = new DiagnosticManagementApi(async () => Response.json({ padding: 'secret'.repeat(30000) }), () => 'http://127.0.0.1:2000')
    await expect(oversized.list('token', {}, new AbortController().signal)).rejects.toThrow()
    const rejected = new DiagnosticManagementApi(async () => Response.json({ secret: 'PRIVATE_SECRET' }, { status: 401 }), () => 'http://127.0.0.1:2000')
    await expect(rejected.list('token', {}, new AbortController().signal)).rejects.toMatchObject({ status: 401 })
  })
  it('terminates a hung native request with its owned timeout', async () => {
    vi.useFakeTimers()
    const api = new DiagnosticManagementApi(async (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DiagnosticManagementError(0)), { once: true })
    }), () => 'http://127.0.0.1:2000')
    const pending = expect(api.list('token', {}, new AbortController().signal)).rejects.toBeInstanceOf(DiagnosticManagementError)
    await vi.advanceTimersByTimeAsync(10000); await pending
  })
  it('rejects invalid catalogue/build/status/time values and never copies extra fields', () => {
    const good = issueFixture()
    for (const extra of [{ errorCode: 'PRIVATE' }, { status: 'secret' }, { status: ['new'] }, { occurrenceCount: -1 },
      { lastSeenAtMs: 1 }, { buildId: 'installation-id' }, { key: '../path' }]) expect(() => readManagementIssue({ ...good, ...extra })).toThrow()
    expect(readManagementIssue({ ...good, raw: 'PRIVATE_STACK' })).toEqual(good)
    expect(() => readManagementPage({ ...pageFixture(), items: [good, good] })).toThrow()
  })
  it('does not send a credential over a remote plaintext origin', async () => {
    const fetch = vi.fn(async () => Response.json(pageFixture()))
    const unsafe = new DiagnosticManagementApi(fetch, () => 'http://errors.example.test')
    await expect(unsafe.list('PRIVATE_TOKEN', {}, new AbortController().signal)).rejects.toMatchObject({ status: 403 })
    expect(fetch).not.toHaveBeenCalled()
    const secure = new DiagnosticManagementApi(fetch, () => 'https://errors.example.test')
    await secure.list('PRIVATE_TOKEN', {}, new AbortController().signal)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects a structurally valid ACK for another row or status', async () => {
    for (const issue of [{ ...issueFixture('fixed', 1), key: 'b'.repeat(64) }, issueFixture('investigating', 1)]) {
      const api = new DiagnosticManagementApi(async () => Response.json({ issue }), () => 'http://127.0.0.1:2000')
      await expect(api.update('token', issueFixture().key, 'fixed', 0, new AbortController().signal)).rejects.toMatchObject({ status: 502 })
    }
  })
})

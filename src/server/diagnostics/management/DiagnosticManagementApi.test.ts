import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createBuildInfo } from '@/lib/version'
import { convertDiagnosticFailure, convertDiagnosticReport } from '@/lib/diagnostics'
import type { DiagnosticIssue, DiagnosticIssueRepository } from '@/lib/diagnostics/management'
import { DiagnosticAdmission } from '../DiagnosticAdmission'
import { FileDiagnosticRepository } from '../FileDiagnosticRepository'
import { DiagnosticRepositoryError } from '../types'
import { DiagnosticManagementApi } from './DiagnosticManagementApi'
import { diagnosticManagementConfiguration } from './configuration'
import { managementUpdate } from './conversion'
import { GET, PATCH } from '@/app/api/diagnostics/issues/route'

const origin = 'http://127.0.0.1:2000', token = 'test-admin-secret-that-is-never-persisted-1234'
const key = 'a'.repeat(64)
const configuration = diagnosticManagementConfiguration({ CHORONO_DIAGNOSTICS_ADMIN_TOKEN: token })
const roots: string[] = []
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

/** Static issue fixture contains only published version and catalogue codes. */
function issue(): DiagnosticIssue {
  const { sample, ...failure } = convertDiagnosticFailure({ failureSite: 'viewport.object-move.commit' })!
  return { ...failure, ...createBuildInfo('0.2.0'), key, occurrenceCount: 1000,
    firstSeenAtMs: 1000, lastSeenAtMs: 2000, status: 'new', revision: 0, updatedAtMs: null, example: sample }
}
function repository() {
  const listIssues = vi.fn<DiagnosticIssueRepository['listIssues']>(async query => ({ items: [issue()], total: 1,
    counts: { new: 1, investigating: 0, fixed: 0 }, offset: query?.offset ?? 0, limit: query?.limit ?? 50 }))
  const setIssueStatus = vi.fn<DiagnosticIssueRepository['setIssueStatus']>(async (_key, status, revision) =>
    ({ ...issue(), status, revision: revision + 1, updatedAtMs: 3000 }))
  return { listIssues, setIssueStatus }
}
function get(query = '', authorization = `Bearer ${token}`, headers: Record<string, string> = {}) {
  return new Request(origin + '/api/diagnostics/issues' + query, { headers: { Authorization: authorization, ...headers } })
}
function patch(body: unknown = { key, status: 'fixed', expectedRevision: 0 }, headers: Record<string, string> = {}) {
  return new Request(origin + '/api/diagnostics/issues', { method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
}

describe('protected diagnostic management HTTP', () => {
  it('requires a valid server-only admin token before any repository call', async () => {
    const repo = repository(), api = new DiagnosticManagementApi(repo)
    expect((await api.get(get(), { ...configuration, enabled: false })).status).toBe(404)
    expect((await api.get(get(), { ...configuration, valid: false })).status).toBe(503)
    for (const value of ['', 'Bearer short', 'Bearer ' + 'x'.repeat(40), token]) {
      const result = await api.get(get('', value), configuration)
      expect(result.status).toBe(401); expect(await result.text()).not.toContain(token)
    }
    expect(repo.listIssues).not.toHaveBeenCalled()
    expect(repo.setIssueStatus).not.toHaveBeenCalled()
  })

  it('serves a bounded page with no cache/CORS/cookie grant and permits paused ingestion', async () => {
    const repo = repository(), result = await new DiagnosticManagementApi(repo).get(
      get('?status=investigating&sort=occurrences&offset=10&limit=25&appVersion=0.2.0'), configuration)
    expect(result.status).toBe(200)
    expect(repo.listIssues).toHaveBeenCalledWith({ status: 'investigating', sort: 'occurrences', offset: 10, limit: 25, appVersion: '0.2.0' })
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect(result.headers.get('referrer-policy')).toBe('no-referrer')
    expect(result.headers.get('access-control-allow-origin')).toBeNull()
    expect(result.headers.get('set-cookie')).toBeNull()
    expect(await result.json()).toMatchObject({ total: 1, offset: 10, limit: 25 })
  })

  it.each(['?status=bad', '?status=new&status=fixed', '?offset=-1', '?offset=1e3', '?offset=10001',
    '?limit=101', '?limit=0', '?sort=bad', '?appVersion=private/path', '?token=secret', '?other=x'])('rejects malformed query %s before IO', async query => {
    const repo = repository(), result = await new DiagnosticManagementApi(repo).get(get(query), configuration)
    expect(result.status).toBe(400); expect(await result.json()).toEqual({ error: 'invalid-issue-query' })
    expect(repo.listIssues).not.toHaveBeenCalled()
  })

  it('keeps both management methods same-origin, with Origin required for PATCH', async () => {
    const repo = repository(), api = new DiagnosticManagementApi(repo)
    expect((await api.get(get('', undefined, { Origin: 'https://evil.test' }), configuration)).status).toBe(403)
    const absent = new Request(origin + '/api/diagnostics/issues', { method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
    expect((await api.patch(absent, configuration)).status).toBe(403)
    expect((await api.patch(patch(undefined, { Origin: 'https://evil.test' }), configuration)).status).toBe(403)
    expect(repo.setIssueStatus).not.toHaveBeenCalled()
  })

  it('returns a committed CAS row and keeps arbitrary fields out of the command', async () => {
    const repo = repository(), api = new DiagnosticManagementApi(repo)
    const result = await api.patch(patch(), configuration)
    expect(result.status).toBe(200); expect(repo.setIssueStatus).toHaveBeenCalledWith(key, 'fixed', 0)
    expect(await result.json()).toMatchObject({ issue: { key, status: 'fixed', revision: 1 } })
    expect((await api.patch(patch({ key, status: 'fixed', expectedRevision: 0, note: 'PRIVATE secret' }), configuration)).status).toBe(400)
    expect(repo.setIssueStatus).toHaveBeenCalledTimes(1)
  })

  it('uses a validated served Host when Next normalizes the request URL hostname', async () => {
    const repo = repository(), api = new DiagnosticManagementApi(repo)
    const normalized = () => new Request('http://localhost:2000/api/diagnostics/issues', { method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, Host: '127.0.0.1:2000', Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, status: 'fixed', expectedRevision: 0 }) })
    expect((await api.patch(normalized(), configuration)).status).toBe(200)
    for (const host of ['name@127.0.0.1:2000', '127.0.0.1:2000/path', '127.0.0.1:2000,evil.test', '127.0.0.1:99999']) {
      const request = normalized(); request.headers.set('host', host)
      expect((await api.patch(request, configuration)).status).toBe(403)
    }
    expect(repo.setIssueStatus).toHaveBeenCalledTimes(1)
  })

  it('requires HTTPS for remote administrative credentials while supporting local HTTP', async () => {
    const repo = repository(), api = new DiagnosticManagementApi(repo)
    const request = (scheme: 'http' | 'https') => new Request(`${scheme}://errors.example.test/api/diagnostics/issues`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, Origin: `${scheme}://errors.example.test`,
        Host: 'errors.example.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ key, status: 'fixed', expectedRevision: 0 }),
    })
    expect((await api.patch(request('http'), configuration)).status).toBe(403)
    expect((await api.get(new Request('http://errors.example.test/api/diagnostics/issues', {
      headers: { Authorization: `Bearer ${token}` },
    }), configuration)).status).toBe(403)
    expect((await api.patch(request('https'), configuration)).status).toBe(200)
    expect(repo.setIssueStatus).toHaveBeenCalledTimes(1)
  })

  it.each([{ key: 'private', status: 'fixed', expectedRevision: 0 }, { key, status: 'deleted', expectedRevision: 0 },
    { key, status: 'new', expectedRevision: -1 }, { key, status: 'new', expectedRevision: 1.2 },
    { key, status: 'fixed' }, null, []])('rejects invalid mutation %#', async body => {
    const repo = repository(), result = await new DiagnosticManagementApi(repo).patch(patch(body), configuration)
    expect(result.status).toBe(400); expect(repo.setIssueStatus).not.toHaveBeenCalled()
  })

  it('caps actual PATCH bytes and rejects invalid JSON/encoding without echo', async () => {
    const repo = repository(), api = new DiagnosticManagementApi(repo)
    expect((await api.patch(patch('x'.repeat(1024)), configuration)).status).toBe(413)
    expect((await api.patch(patch(undefined, { 'Content-Type': 'text/plain' }), configuration)).status).toBe(415)
    expect((await api.patch(patch(undefined, { 'Content-Encoding': 'gzip' }), configuration)).status).toBe(415)
    const malformed = new Request(origin + '/api/diagnostics/issues', { method: 'PATCH', headers: patch().headers, body: '{PRIVATE path/token' })
    const result = await api.patch(malformed, configuration)
    expect(result.status).toBe(400); expect(await result.text()).not.toMatch(/PRIVATE|path|token/)
    expect(repo.setIssueStatus).not.toHaveBeenCalled()
  })

  it('does not execute accessors when converting a command record', () => {
    const read = vi.fn(() => key)
    expect(managementUpdate({ get key() { return read() }, status: 'fixed', expectedRevision: 0 })).toBeUndefined()
    expect(read).not.toHaveBeenCalled()
  })

  it('maps stale/missing/corrupt repository failures to fixed safe codes', async () => {
    const repo = repository(), api = new DiagnosticManagementApi(repo)
    repo.setIssueStatus.mockRejectedValueOnce(new DiagnosticRepositoryError('issue-conflict'))
    expect((await api.patch(patch(), configuration)).status).toBe(409)
    repo.setIssueStatus.mockRejectedValueOnce(new DiagnosticRepositoryError('issue-not-found'))
    expect((await api.patch(patch(), configuration)).status).toBe(404)
    repo.listIssues.mockRejectedValueOnce(new Error('/private/files/token/secret'))
    const result = await api.get(get(), configuration)
    expect(result.status).toBe(503); expect(await result.text()).not.toMatch(/private|files|token|secret/)
  })

  it('bounds active IO and releases the slot after completion', async () => {
    const repo = repository(); let finish!: () => void
    repo.listIssues.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve }); return { items: [], total: 0, counts: { new: 0, investigating: 0, fixed: 0 }, offset: 0, limit: 50 } })
    const api = new DiagnosticManagementApi(repo, new DiagnosticAdmission(2, 1, () => 1000))
    const first = api.get(get(), configuration)
    await Promise.resolve(); const second = await api.get(get(), configuration)
    expect(second.status).toBe(429); expect(second.headers.get('retry-after')).toBe('60')
    finish(); expect((await first).status).toBe(200)
    expect((await api.get(get(), configuration)).status).toBe(200)
  })
})

describe('management configuration and actual Next route', () => {
  it('fails closed for short/long/control/nonASCII tokens and reuses private depot validation', () => {
    for (const token of ['', 'short', 'x'.repeat(257), 'x'.repeat(32) + '\n', 'x'.repeat(31) + 'é', 'x'.repeat(31) + ' ']) {
      expect(diagnosticManagementConfiguration({ CHORONO_DIAGNOSTICS_ADMIN_TOKEN: token }).enabled).toBe(false)
    }
    expect(diagnosticManagementConfiguration({ CHORONO_DIAGNOSTICS_ADMIN_TOKEN: token, CHORONO_DIAGNOSTICS_DIR: '' }).valid).toBe(false)
    expect(configuration.enabled).toBe(true)
  })

  it('real GET/PATCH lists paused receiver data and persists status without changing counts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'chorono-diagnostic-admin-')); roots.push(root)
    vi.stubEnv('CHORONO_DIAGNOSTICS_ADMIN_TOKEN', token); vi.stubEnv('CHORONO_DIAGNOSTICS_DIR', root)
    vi.stubEnv('CHORONO_DIAGNOSTICS_ENABLED', '0')
    const report = convertDiagnosticReport({ ...createBuildInfo('0.2.0'), ...convertDiagnosticFailure({ failureSite: 'viewport.object-move.commit' }),
      day: '2026-11-10', occurrenceCount: 9 }, randomUUID())!
    await new FileDiagnosticRepository(root).accept(report)
    const listed = await GET(get()); expect(listed.status).toBe(200)
    const page = await listed.json(); expect(page.items).toHaveLength(1); expect(page.items[0].occurrenceCount).toBe(9)
    const changed = await PATCH(patch({ key: page.items[0].key, status: 'investigating', expectedRevision: 0 }))
    expect(changed.status).toBe(200); expect(await changed.json()).toMatchObject({ issue: { status: 'investigating', revision: 1, occurrenceCount: 9 } })
    const restored = await new FileDiagnosticRepository(root).listIssues()
    expect(restored.items[0].status).toBe('investigating')
    expect((await PATCH(patch({ key: page.items[0].key, status: 'fixed', expectedRevision: 0 }))).status).toBe(409)
  })

  it('returns configured404 or authentication401 without exposing environment values', async () => {
    vi.stubEnv('CHORONO_DIAGNOSTICS_ADMIN_TOKEN', '')
    expect((await GET(get())).status).toBe(404); expect((await PATCH(patch())).status).toBe(404)
    vi.stubEnv('CHORONO_DIAGNOSTICS_ADMIN_TOKEN', token)
    const result = await GET(get('', ''))
    expect(result.status).toBe(401); expect(await result.text()).not.toContain(token)
  })
})

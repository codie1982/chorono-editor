import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createBuildInfo } from '@/lib/version'
import { convertDiagnosticFailure, convertDiagnosticReport } from '@/lib/diagnostics'
import { DiagnosticAdmission } from './DiagnosticAdmission'
import { DiagnosticReceiver, diagnosticOptions } from './DiagnosticReceiver'
import { DIAGNOSTIC_POLICY, receiverConfiguration, diagnosticRelease } from './configuration'
import type { DiagnosticRepository } from './types'
import { GET as versionGet, OPTIONS as versionOptions } from '@/app/api/diagnostics/version/route'
import { POST as routePost } from '@/app/api/diagnostics/reports/route'
import { FileDiagnosticRepository } from './FileDiagnosticRepository'

const origin = 'http://127.0.0.1:2000'
const config = receiverConfiguration({ CHORONO_DIAGNOSTICS_ENABLED: '1', CHORONO_DIAGNOSTICS_ALLOWED_ORIGINS: origin })
const report = () => convertDiagnosticReport({ ...createBuildInfo('0.2.0'),
  ...convertDiagnosticFailure({ failureSite: 'viewport.object-move.commit' }),
  day: '2026-11-10', occurrenceCount: 3 }, randomUUID())!
const request = (body: unknown = report(), headers: Record<string, string> = {}) => new Request(origin + '/api/diagnostics/reports', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Chorono-Diagnostics-Policy': DIAGNOSTIC_POLICY, ...headers }, body: JSON.stringify(body),
})
const roots: string[] = []
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('DiagnosticReceiver HTTP boundary', () => {
  it('passes only a validated code-only report to persistence and returns exact ACK', async () => {
    const accept = vi.fn(async value => ({ accepted: true as const, reportId: value.reportId, duplicate: false }))
    const result = await new DiagnosticReceiver({ accept }).post(request(), config)
    expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ accepted: true, duplicate: false })
    expect(accept).toHaveBeenCalledTimes(1)
    expect(result.headers.get('access-control-allow-origin')).toBe(origin)
    expect(result.headers.get('access-control-allow-credentials')).toBeNull()
    expect(result.headers.get('cache-control')).toBe('no-store')
  })

  it('rejects disabled/malformed deployment, origins, policy and unknown fields before persistence', async () => {
    const accept = vi.fn(), receiver = new DiagnosticReceiver({ accept })
    expect((await receiver.post(request(), { ...config, enabled: false })).status).toBe(404)
    expect((await receiver.post(request(), { ...config, valid: false })).status).toBe(503)
    expect((await receiver.post(request(undefined, { Origin: 'https://evil.test' }), config)).status).toBe(403)
    expect((await receiver.post(request(undefined, { 'X-Chorono-Diagnostics-Policy': '' }), config)).status).toBe(403)
    expect((await receiver.post(request({ ...report(), secret: 'private/path/token' }), config)).status).toBe(400)
    expect((await receiver.post(request(undefined, { 'Content-Type': 'text/plain' }), config)).status).toBe(415)
    expect(accept).not.toHaveBeenCalled()
  })

  it('caps actual streaming bytes even without Content-Length and exposes only safe errors', async () => {
    const accept = vi.fn(), receiver = new DiagnosticReceiver({ accept })
    expect((await receiver.post(request('x'.repeat(16 * 1024)), config)).status).toBe(413)
    const malformed = new Request(origin + '/api/diagnostics/reports', { method: 'POST', headers: request().headers, body: '{PRIVATE token/path' })
    const result = await receiver.post(malformed, config)
    expect(result.status).toBe(400); expect(await result.text()).not.toMatch(/PRIVATE|token|path/)
    expect(accept).not.toHaveBeenCalled()
  })

  it('limits ingress and recovers concurrency slots after actual completion', async () => {
    let finish!: () => void
    const repository: DiagnosticRepository = { accept: async value => { await new Promise<void>(resolve => { finish = resolve }); return { accepted: true, reportId: value.reportId, duplicate: false } } }
    const receiver = new DiagnosticReceiver(repository, new DiagnosticAdmission(2, 1, () => 1000))
    const first = receiver.post(request(), config)
    for (let n = 0; !finish && n < 30; n++) await new Promise(resolve => setTimeout(resolve, 1))
    const limited = await receiver.post(request(), config)
    expect(limited.status).toBe(429); expect(limited.headers.get('retry-after')).toBe('60')
    finish(); expect((await first).status).toBe(200)
  })

  it('narrows credential-free preflight to allowed origin, method and fixed headers', () => {
    const make = (method = 'POST', header = 'content-type,x-chorono-diagnostics-policy') => new Request(origin, { method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': header } })
    expect(diagnosticOptions(make(), config, 'POST').status).toBe(204)
    expect(diagnosticOptions(make('DELETE'), config, 'POST').status).toBe(403)
    expect(diagnosticOptions(make('POST', 'authorization'), config, 'POST').status).toBe(403)
  })

  it('keeps global rate windows finite without network-identity storage', () => {
    let now = 1000
    const gate = new DiagnosticAdmission(2, 1, () => now)
    const first = gate.acquire()!; expect(gate.acquire()).toBeUndefined()
    first.release(); first.release(); expect(gate.acquire()).toBeDefined()
    expect(gate.acquire()).toBeUndefined(); now = 0; expect(gate.acquire()).toBeUndefined()
    expect(new DiagnosticAdmission(2, 1, () => { throw new Error('clock') }).acquire()).toBeUndefined()
    expect(() => new DiagnosticAdmission(Infinity)).toThrow(RangeError)
  })
})

describe('receiver configuration and Next routes', () => {
  it('disallows wildcard/plain remote HTTP CORS and never echoes malformed config', () => {
    for (const value of ['*', 'http://remote.test', 'https://name:secret@remote.test', 'https://remote.test/path']) {
      expect(receiverConfiguration({ CHORONO_DIAGNOSTICS_ALLOWED_ORIGINS: value }).valid).toBe(false)
    }
    expect(receiverConfiguration({ CHORONO_DIAGNOSTICS_ALLOWED_ORIGINS: 'https://chorono.test,http://127.0.0.1:2000' }).valid).toBe(true)
  })

  it('rejects unsafe release metadata and permits only trusted version + HTTPS notes', () => {
    expect(diagnosticRelease({})).toBeNull()
    expect(diagnosticRelease({ CHORONO_DIAGNOSTICS_LATEST_VERSION: '0.2.1' })).toEqual({ version: '0.2.1', notesUrl: null })
    expect(() => diagnosticRelease({ CHORONO_DIAGNOSTICS_LATEST_VERSION: 'private/path' })).toThrow()
    for (const url of ['javascript:alert(1)', 'https://name:token@example.test', 'https://example.test/?token=secret',
      'https://127.0.0.1/private', 'https://localhost/private', 'https://service.internal/private']) {
      expect(() => diagnosticRelease({ CHORONO_DIAGNOSTICS_LATEST_VERSION: '0.2.1', CHORONO_DIAGNOSTICS_RELEASE_NOTES_URL: url })).toThrow()
    }
  })

  it('real enabled Next POST persists and deduplicates through the production repository', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'chorono-diagnostic-route-')); roots.push(root)
    vi.stubEnv('CHORONO_DIAGNOSTICS_ENABLED', '1'); vi.stubEnv('CHORONO_DIAGNOSTICS_ALLOWED_ORIGINS', origin)
    vi.stubEnv('CHORONO_DIAGNOSTICS_DIR', root)
    const value = report()
    expect(await (await routePost(request(value))).json()).toEqual({ accepted: true, reportId: value.reportId, duplicate: false })
    expect(await (await routePost(request(value))).json()).toEqual({ accepted: true, reportId: value.reportId, duplicate: true })
    const persisted = await new FileDiagnosticRepository(root).inspect()
    expect(persisted.groups).toHaveLength(1); expect(persisted.groups[0].summary.occurrenceCount).toBe(3)
    expect((await routePost(request({ ...value, occurrenceCount: 4 }))).status).toBe(409)
  })

  it('real Next version route observes disabled,204,valid and malformed configuration', async () => {
    const get = () => new Request(origin + '/api/diagnostics/version', { headers: { Origin: origin, 'X-Chorono-Diagnostics-Policy': DIAGNOSTIC_POLICY } })
    vi.stubEnv('CHORONO_DIAGNOSTICS_ENABLED', '0'); expect(versionGet(get()).status).toBe(404)
    expect((await routePost(request())).status).toBe(404)
    vi.stubEnv('CHORONO_DIAGNOSTICS_ENABLED', '1'); vi.stubEnv('CHORONO_DIAGNOSTICS_ALLOWED_ORIGINS', origin)
    vi.stubEnv('CHORONO_DIAGNOSTICS_LATEST_VERSION', ''); expect(versionGet(get()).status).toBe(204)
    vi.stubEnv('CHORONO_DIAGNOSTICS_LATEST_VERSION', '0.2.1')
    expect(await versionGet(get()).json()).toEqual({ version: '0.2.1', notesUrl: null })
    const sameOrigin = versionGet(new Request(origin + '/api/diagnostics/version', {
      headers: { 'X-Chorono-Diagnostics-Policy': DIAGNOSTIC_POLICY },
    }))
    expect(sameOrigin.status).toBe(200); expect(sameOrigin.headers.get('access-control-allow-origin')).toBeNull()
    vi.stubEnv('CHORONO_DIAGNOSTICS_LATEST_VERSION', 'private/path')
    expect(versionGet(get()).status).toBe(503)
    expect(versionOptions(new Request(origin, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' } })).status).toBe(204)
  })
})

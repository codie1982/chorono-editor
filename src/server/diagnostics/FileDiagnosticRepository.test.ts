import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { createBuildInfo } from '@/lib/version'
import { convertDiagnosticFailure, convertDiagnosticReport } from '@/lib/diagnostics'
import { FileDiagnosticRepository } from './FileDiagnosticRepository'
import { MAX_DEPOT_BYTES, MAX_DEPOT_RECEIPTS } from './depotCodec'

const roots: string[] = [], DAY = 86_400_000
async function directory() { const root = await mkdtemp(path.join(os.tmpdir(), 'chorono-diagnostic-depot-')); roots.push(root); return root }
const report = (count = 3) => convertDiagnosticReport({ ...createBuildInfo('0.2.0'),
  ...convertDiagnosticFailure({ failureSite: 'viewport.object-move.commit' }),
  day: '2026-11-10', occurrenceCount: count }, randomUUID())!
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('FileDiagnosticRepository', () => {
  it('persists a real count across new instances and ACKs duplicates without recount', async () => {
    const root = await directory(), value = report(), now = Date.UTC(2026, 10, 10)
    expect(await new FileDiagnosticRepository(root, () => now).accept(value)).toEqual({ accepted: true, reportId: value.reportId, duplicate: false })
    const restarted = new FileDiagnosticRepository(root, () => now)
    expect((await restarted.accept(value)).duplicate).toBe(true)
    const state = await restarted.inspect()
    expect(state.receipts).toHaveLength(1); expect(state.groups).toHaveLength(1)
    expect(state.groups[0].summary.occurrenceCount).toBe(3)
    expect((await stat(path.join(root, 'state.json'))).mode & 0o777).toBe(0o600)
    expect((await stat(root)).mode & 0o777).toBe(0o700)
  })

  it('serializes duplicate and distinct deltas across concurrent repository instances', async () => {
    const root = await directory(), first = report(7), second = report(2)
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      new FileDiagnosticRepository(root).accept(index % 2 ? first : second)))
    expect(results.filter(r => !r.duplicate)).toHaveLength(2)
    expect((await new FileDiagnosticRepository(root).inspect()).groups[0].summary.occurrenceCount).toBe(9)
  })

  it('rejects reused report ID for changed payload and leaves committed counts intact', async () => {
    const root = await directory(), repository = new FileDiagnosticRepository(root), value = report()
    await repository.accept(value)
    await expect(repository.accept({ ...value, occurrenceCount: 100 })).rejects.toMatchObject({ code: 'report-conflict' })
    expect((await repository.inspect()).groups[0].summary.occurrenceCount).toBe(3)
  })

  it('prunes samples/receipts after7days and aggregates after90days, durably', async () => {
    const root = await directory(); let now = Date.UTC(2026, 10, 10)
    const repository = new FileDiagnosticRepository(root, () => now)
    await repository.accept(report())
    now += 7 * DAY
    const retained = await repository.inspect()
    expect(retained.receipts).toHaveLength(0); expect(retained.groups[0].example).toBeNull()
    expect(retained.groups[0].summary.occurrenceCount).toBe(3)
    expect((await new FileDiagnosticRepository(root, () => now).inspect()).groups[0].example).toBeNull()
    now += 83 * DAY
    expect((await repository.inspect()).groups).toHaveLength(0)
  })

  it('does not retain private fields and rejects corrupted or oversized committed state', async () => {
    const root = await directory(), repository = new FileDiagnosticRepository(root)
    await expect(repository.accept({ ...report(), secret: 'PRIVATE token/path' } as never)).rejects.toMatchObject({ code: 'depot-unavailable' })
    await repository.accept(report())
    expect(await readFile(path.join(root, 'state.json'), 'utf8')).not.toMatch(/PRIVATE|token|path/)
    await writeFile(path.join(root, 'state.json'), '{broken', 'utf8')
    await expect(repository.accept(report())).rejects.toMatchObject({ code: 'depot-unavailable' })
    await writeFile(path.join(root, 'state.json'), 'x'.repeat(MAX_DEPOT_BYTES + 1), 'utf8')
    await expect(repository.accept(report())).rejects.toMatchObject({ code: 'depot-capacity' })
  })

  it('fails closed when live dedup capacity is full rather than forgetting receipts', async () => {
    const root = await directory(), repository = new FileDiagnosticRepository(root), value = report()
    await repository.accept(value)
    const file = path.join(root, 'state.json'), state = JSON.parse(await readFile(file, 'utf8'))
    state.receipts = Array.from({ length: MAX_DEPOT_RECEIPTS }, (_, index) => ({
      reportId: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
      fingerprint: 'a'.repeat(64), expiresAtMs: Date.now() + DAY,
    }))
    await writeFile(file, JSON.stringify(state))
    await expect(repository.accept(report())).rejects.toMatchObject({ code: 'depot-capacity' })
    expect((await repository.inspect()).receipts).toHaveLength(MAX_DEPOT_RECEIPTS)
  })

  it('does not steal a leftover lock or overwrite its committed state', async () => {
    const root = await directory(), repository = new FileDiagnosticRepository(root)
    await repository.accept(report())
    const before = await readFile(path.join(root, 'state.json'), 'utf8')
    await mkdir(path.join(root, '.write-lock'))
    await expect(repository.accept(report())).rejects.toMatchObject({ code: 'depot-busy' })
    expect(await readFile(path.join(root, 'state.json'), 'utf8')).toBe(before)
  })
})

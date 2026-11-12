import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { createBuildInfo } from '@/lib/version'
import { convertDiagnosticFailure, convertDiagnosticReport, type DiagnosticFailureSite } from '@/lib/diagnostics'
import { FileDiagnosticRepository } from './FileDiagnosticRepository'
import { validateDiagnosticIssueQuery } from './issueProjection'

const DAY = 86400000, start = Date.UTC(2026, 10, 10), roots: string[] = []
async function directory() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chorono-diagnostic-issues-')); roots.push(root); return root
}
function report(count = 3, day = '2026-11-10', version = '0.2.0', site: DiagnosticFailureSite = 'viewport.object-move.commit') {
  return convertDiagnosticReport({ ...createBuildInfo(version), ...convertDiagnosticFailure({ failureSite: site }),
    day, occurrenceCount: count }, randomUUID())!
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('durable diagnostic issue management', () => {
  it('aggregates UTC days into one build/site issue with actual server receipt times', async () => {
    const root = await directory(); let now = start
    const repository = new FileDiagnosticRepository(root, () => now)
    await repository.accept(report(4)); now += 1000; await repository.accept(report(2))
    now += DAY; await repository.accept(report(7, '2026-11-11'))
    const page = await repository.listIssues()
    expect(page.total).toBe(1); expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({ occurrenceCount: 13, firstSeenAtMs: start,
      lastSeenAtMs: now, status: 'new', revision: 0, updatedAtMs: null })
    expect(page.counts).toEqual({ new: 1, investigating: 0, fixed: 0 })
    expect(Object.isFrozen(page)).toBe(true); expect(Object.isFrozen(page.items[0])).toBe(true)
    expect((await repository.inspect()).groups).toHaveLength(2)
  })

  it('keeps different releases and static failure sites separate', async () => {
    const repository = new FileDiagnosticRepository(await directory(), () => start)
    await repository.accept(report(4)); await repository.accept(report(2, '2026-11-10', '0.2.1'))
    await repository.accept(report(1, '2026-11-10', '0.2.0', 'viewport.guide.commit'))
    const page = await repository.listIssues({ sort: 'occurrences' })
    expect(page.items.map(value => value.occurrenceCount)).toEqual([4, 2, 1])
    expect(new Set(page.items.map(value => value.key)).size).toBe(3)
  })

  it('persists status after restart and leaves it intact on new data and duplicate retry', async () => {
    const root = await directory(); let now = start
    const repository = new FileDiagnosticRepository(root, () => now), first = report(4)
    await repository.accept(first)
    const item = (await repository.listIssues()).items[0]
    const investigating = await repository.setIssueStatus(item.key, 'investigating', 0)
    expect(investigating).toMatchObject({ status: 'investigating', revision: 1, updatedAtMs: now })
    const fixed = await new FileDiagnosticRepository(root, () => now).setIssueStatus(item.key, 'fixed', 1)
    expect(fixed.status).toBe('fixed'); expect(fixed.revision).toBe(2)
    now += DAY; await repository.accept(report(3, '2026-11-11'))
    expect((await repository.accept(first)).duplicate).toBe(true)
    const final = (await new FileDiagnosticRepository(root, () => now).listIssues()).items[0]
    expect(final).toMatchObject({ key: item.key, occurrenceCount: 7, status: 'fixed', revision: 2, lastSeenAtMs: now })
    expect(JSON.stringify(final)).not.toContain(first.reportId)
  })

  it('makes current-revision status no-ops idempotent and stale changes explicit', async () => {
    const repository = new FileDiagnosticRepository(await directory(), () => start)
    await repository.accept(report()); const issue = (await repository.listIssues()).items[0]
    expect((await repository.setIssueStatus(issue.key, 'new', 0)).revision).toBe(0)
    expect((await repository.inspect()).triage).toHaveLength(0)
    expect((await repository.setIssueStatus(issue.key, 'fixed', 0)).revision).toBe(1)
    expect((await repository.setIssueStatus(issue.key, 'fixed', 1)).revision).toBe(1)
    await expect(repository.setIssueStatus(issue.key, 'investigating', 0)).rejects.toMatchObject({ code: 'issue-conflict' })
    await expect(repository.setIssueStatus('a'.repeat(64), 'fixed', 0)).rejects.toMatchObject({ code: 'issue-not-found' })
  })

  it('serializes competing manual changes and ingestion without losing counts', async () => {
    const root = await directory(), repository = new FileDiagnosticRepository(root, () => start)
    await repository.accept(report(1)); const issue = (await repository.listIssues()).items[0]
    const results = await Promise.allSettled([
      new FileDiagnosticRepository(root, () => start + 1000).setIssueStatus(issue.key, 'investigating', 0),
      new FileDiagnosticRepository(root, () => start + 2000).setIssueStatus(issue.key, 'fixed', 0),
      new FileDiagnosticRepository(root, () => start + 3000).accept(report(5)),
    ])
    expect(results.filter(value => value.status === 'rejected')).toHaveLength(1)
    const failure = results.find(value => value.status === 'rejected') as PromiseRejectedResult
    expect(failure.reason.code).toBe('issue-conflict')
    const final = (await repository.listIssues()).items[0]
    expect(final.occurrenceCount).toBe(6); expect(final.revision).toBe(1)
    expect(['investigating', 'fixed']).toContain(final.status)
  })

  it('filters status/version, reports matching status counts and paginates deterministically', async () => {
    const repository = new FileDiagnosticRepository(await directory(), () => start)
    await repository.accept(report(8)); await repository.accept(report(2, '2026-11-10', '0.2.1'))
    await repository.accept(report(4, '2026-11-10', '0.2.0', 'viewport.guide.commit'))
    const list = await repository.listIssues({ sort: 'occurrences' })
    await repository.setIssueStatus(list.items[0].key, 'fixed', 0)
    const page = await repository.listIssues({ appVersion: '0.2.0', status: 'new', limit: 1 })
    expect(page.total).toBe(1); expect(page.items[0].failureSite).toBe('viewport.guide.commit')
    expect(page.counts).toEqual({ new: 1, investigating: 0, fixed: 1 })
    expect((await repository.listIssues({ sort: 'occurrences', offset: 1, limit: 1 })).items[0].occurrenceCount).toBe(4)
    expect((await repository.listIssues({ offset: 10 })).items).toHaveLength(0)
  })

  it('migrates v1 state without recounting or pretending to know legacy last-receipt time', async () => {
    const root = await directory(), original = report(9)
    await new FileDiagnosticRepository(root, () => start).accept(original)
    const filename = path.join(root, 'state.json'), state = JSON.parse(await readFile(filename, 'utf8'))
    state.schemaVersion = 1; delete state.triage
    for (const group of state.groups) { delete group.firstSeenAtMs; delete group.lastSeenAtMs }
    await writeFile(filename, JSON.stringify(state))
    const repository = new FileDiagnosticRepository(root, () => start + DAY)
    const issue = (await repository.listIssues()).items[0]
    expect(issue).toMatchObject({ occurrenceCount: 9, firstSeenAtMs: start, lastSeenAtMs: start, status: 'new', revision: 0 })
    expect((await repository.accept(original)).duplicate).toBe(true)
    const migrated = JSON.parse(await readFile(filename, 'utf8'))
    expect(migrated.schemaVersion).toBe(2); expect(migrated.triage).toEqual([])
    expect(migrated.receipts).toHaveLength(1)
    await repository.accept(report(2, '2026-11-11'))
    expect((await repository.listIssues()).items[0]).toMatchObject({ occurrenceCount: 11, lastSeenAtMs: start + DAY })
  })

  it('expires orphan triage with its last retained count while preserving newer days', async () => {
    const root = await directory(); let now = start
    const repository = new FileDiagnosticRepository(root, () => now)
    await repository.accept(report(1)); const issue = (await repository.listIssues()).items[0]
    await repository.setIssueStatus(issue.key, 'fixed', 0)
    now += 89 * DAY; await repository.accept(report(2, '2027-02-07'))
    now += DAY; expect((await repository.listIssues()).items[0]).toMatchObject({ occurrenceCount: 2, status: 'fixed' })
    now += 89 * DAY
    expect((await repository.listIssues()).total).toBe(0); expect((await repository.inspect()).triage).toHaveLength(0)
  })

  it('fails closed on corrupted issue metadata instead of dropping a manual decision', async () => {
    const root = await directory(), repository = new FileDiagnosticRepository(root, () => start)
    await repository.accept(report()); const issue = (await repository.listIssues()).items[0]
    await repository.setIssueStatus(issue.key, 'fixed', 0)
    const filename = path.join(root, 'state.json'), good = JSON.parse(await readFile(filename, 'utf8'))
    for (const extra of [{ status: 'arbitrary' }, { revision: -1 }, { key: 'a'.repeat(64) }, { private: 'secret' }]) {
      const state = { ...good, triage: [{ ...good.triage[0], ...extra }] }
      await writeFile(filename, JSON.stringify(state))
      await expect(repository.listIssues()).rejects.toMatchObject({ code: 'depot-unavailable' })
    }
    await writeFile(filename, JSON.stringify({ ...good, schemaVersion: 3 }))
    await expect(repository.listIssues()).rejects.toMatchObject({ code: 'depot-unavailable' })
  })

  it('saturates cross-day aggregate counts without integer overflow', async () => {
    const root = await directory(), repository = new FileDiagnosticRepository(root, () => start)
    await repository.accept(report()); await repository.accept(report(4, '2026-11-11'))
    const filename = path.join(root, 'state.json'), state = JSON.parse(await readFile(filename, 'utf8'))
    state.groups[0].summary.occurrenceCount = Number.MAX_SAFE_INTEGER
    await writeFile(filename, JSON.stringify(state))
    expect((await repository.listIssues()).items[0].occurrenceCount).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('issue query contract', () => {
  it.each([{ limit: 0 }, { limit: 101 }, { offset: -1 }, { offset: 10001 }, { offset: 1.1 },
    { status: 'private' }, { sort: 'private' }, { appVersion: '/Users/private' }, { unknown: 'private' }])('rejects invalid query %j', input => {
    expect(() => validateDiagnosticIssueQuery(input as never)).toThrow('invalid-issue-query')
  })
})

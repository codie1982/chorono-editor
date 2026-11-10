import { describe, expect, it, vi } from 'vitest'
import { createBuildInfo, type BuildInfo } from '@/lib/version'
import { DiagnosticSummaryStore } from './DiagnosticSummaryStore'

const build = createBuildInfo('0.2.0')
const start = Date.UTC(2026, 10, 10, 12)
const move = { failureSite: 'viewport.object-move.commit' }
const guide = { failureSite: 'viewport.guide.commit' }
const shape = { failureSite: 'viewport.shape-placement.commit' }

describe('DiagnosticSummaryStore', () => {
  it('does not collect at construction and aggregates 1000 repeats into one exact counter', () => {
    const clock = vi.fn(() => start), store = new DiagnosticSummaryStore(build, { clock })
    const empty = store.getSnapshot()
    expect(clock).not.toHaveBeenCalled()
    expect(empty).toEqual({ day: null, groups: [], overflowCount: 0 })
    for (let i = 0; i < 1000; i++) expect(store.record(move)).toBe('recorded')
    const snapshot = store.getSnapshot()
    expect(snapshot.day).toBe('2026-11-10')
    expect(snapshot.groups).toHaveLength(1)
    expect(snapshot.groups[0]).toMatchObject({ ...build, occurrenceCount: 1000, failureSite: move.failureSite })
    expect(empty).toEqual({ day: null, groups: [], overflowCount: 0 })
  })

  it('keeps different static sites separate even when they have the same generic error code', () => {
    const store = new DiagnosticSummaryStore(build, { clock: () => start })
    store.record(move); store.record(guide); store.record(move)
    const groups = store.getSnapshot().groups
    expect(groups.map(group => group.failureSite)).toEqual([move.failureSite, guide.failureSite])
    expect(groups.map(group => group.occurrenceCount)).toEqual([2, 1])
    expect(groups[0].errorCode).toBe(groups[1].errorCode)
  })

  it('counts capacity overflow occurrences without retaining extra fingerprints or samples', () => {
    const store = new DiagnosticSummaryStore(build, { clock: () => start, maxGroups: 2 })
    store.record(move); store.record(guide)
    expect(store.record(shape)).toBe('overflow')
    expect(store.record(shape)).toBe('overflow')
    expect(store.record(move)).toBe('recorded')
    expect(store.getSnapshot().groups.map(group => group.failureSite)).toEqual([move.failureSite, guide.failureSite])
    expect(store.getSnapshot().groups[0].occurrenceCount).toBe(2)
    expect(store.getSnapshot().overflowCount).toBe(2)
  })

  it('keeps the default twenty-group cap across every current static site', () => {
    const store = new DiagnosticSummaryStore(build, { clock: () => start })
    const tools = ['object-move', 'object-rotate', 'object-scale', 'object-anchor', 'object-resize', 'guide', 'shape-placement', 'motion-key']
    const sites = tools.flatMap(tool => ['preview', 'commit', 'rollback'].map(phase => `viewport.${tool}.${phase}`))
    sites.push('application.unhandled-error', 'application.unhandled-rejection', 'application.render-failed')
    for (const failureSite of sites) store.record({ failureSite })
    expect(store.getSnapshot().groups).toHaveLength(20)
    expect(store.getSnapshot().overflowCount).toBe(7)
  })

  it('saturates group and overflow counts while preserving snapshot identity on no-op', () => {
    const store = new DiagnosticSummaryStore(build, { clock: () => start, maxGroups: 1, maxCount: 2 })
    store.record(move); store.record(move)
    const fullGroup = store.getSnapshot()
    expect(store.record(move)).toBe('saturated')
    expect(store.getSnapshot()).toBe(fullGroup)
    store.record(guide); store.record(shape)
    const fullOverflow = store.getSnapshot()
    expect(store.record(shape)).toBe('saturated')
    expect(store.getSnapshot()).toBe(fullOverflow)
    expect(fullOverflow.groups[0].occurrenceCount).toBe(2)
    expect(fullOverflow.overflowCount).toBe(2)
  })

  it('ignores ordinary actions, cancellation reasons and arbitrary errors without consulting the clock', () => {
    const clock = vi.fn(() => start), store = new DiagnosticSummaryStore(build, { clock })
    const initial = store.getSnapshot()
    for (const input of [null, undefined, new Error('secret'), { event: 'source-cancel', reason: 'native:blur' },
      { failureSite: 'viewport.object-move.cancel' }, { failureSite: 'viewport.object-move.commit ' }]) {
      expect(store.record(input)).toBe('ignored-input')
      expect(store.getSnapshot()).toBe(initial)
    }
    expect(clock).not.toHaveBeenCalled()
  })

  it('rolls groups and overflow together on the next accepted UTC day', () => {
    let now = Date.UTC(2026, 10, 10, 23, 59, 59, 999)
    const store = new DiagnosticSummaryStore(build, { clock: () => now, maxGroups: 1 })
    store.record(move); store.record(guide)
    const old = store.getSnapshot()
    now++
    expect(store.record(guide)).toBe('recorded')
    expect(store.getSnapshot()).toMatchObject({ day: '2026-11-11', overflowCount: 0 })
    expect(store.getSnapshot().groups).toHaveLength(1)
    expect(store.getSnapshot().groups[0]).toMatchObject({ failureSite: guide.failureSite, occurrenceCount: 1 })
    expect(old).toMatchObject({ day: '2026-11-10', overflowCount: 1 })
  })

  it('ignores backwards time within the same day or an earlier day without losing current evidence', () => {
    let now = start
    const store = new DiagnosticSummaryStore(build, { clock: () => now })
    store.record(move)
    const before = store.getSnapshot()
    now--
    expect(store.record(guide)).toBe('ignored-clock')
    now -= 86_400_000
    expect(store.record(guide)).toBe('ignored-clock')
    expect(store.getSnapshot()).toBe(before)
    now = start + 1
    expect(store.record(move)).toBe('recorded')
    expect(store.getSnapshot().groups[0].occurrenceCount).toBe(2)
  })

  it('rejects invalid timestamps and isolates a throwing injected clock', () => {
    let now = start, throws = false
    const store = new DiagnosticSummaryStore(build, { clock: () => { if (throws) throw new Error('clock'); return now } })
    store.record(move)
    const before = store.getSnapshot()
    for (const invalid of [NaN, Infinity, -1, start + 0.5, 253_402_300_800_000]) {
      now = invalid
      expect(store.record(guide)).toBe('ignored-clock')
      expect(store.getSnapshot()).toBe(before)
    }
    throws = true
    expect(store.record(guide)).toBe('ignored-clock')
    expect(store.getSnapshot()).toBe(before)
  })

  it('clear drops evidence while preserving its day and clock high water', () => {
    let now = start
    const store = new DiagnosticSummaryStore(build, { clock: () => now, maxGroups: 1 })
    store.record(move); store.record(guide); store.clear()
    const cleared = store.getSnapshot()
    expect(cleared).toEqual({ day: '2026-11-10', groups: [], overflowCount: 0 })
    store.clear()
    expect(store.getSnapshot()).toBe(cleared)
    now--
    expect(store.record(move)).toBe('ignored-clock')
    expect(store.getSnapshot()).toBe(cleared)
    now = start
    expect(store.record(guide)).toBe('recorded')
  })

  it('freezes retained data, copies build identity and never retains canary input fields', () => {
    const mutableBuild: BuildInfo = { ...build }
    const store = new DiagnosticSummaryStore(mutableBuild, { clock: () => start })
    const input = { ...move, token: 'SECRET_CANARY', scene: { name: 'PRIVATE_PROJECT' }, message: '/Users/private/path' }
    store.record(input)
    const first = store.getSnapshot(), sample = first.groups[0].sample
    input.failureSite = guide.failureSite
    Object.assign(mutableBuild, { appVersion: '9.9.9', buildId: 'private', channel: 'stable' })
    store.record(move)
    const second = store.getSnapshot()
    expect(second.groups[0]).toMatchObject({ ...build, occurrenceCount: 2, failureSite: move.failureSite })
    expect(second.groups[0].sample).toBe(sample)
    for (const item of [first, first.groups, first.groups[0], sample]) expect(Object.isFrozen(item)).toBe(true)
    const json = JSON.stringify(second)
    for (const secret of ['SECRET_CANARY', 'PRIVATE_PROJECT', '/Users/private/path', 'private', '9.9.9']) expect(json).not.toContain(secret)
    expect(first.groups[0].occurrenceCount).toBe(1)
  })

  it('isolates instances and preserves validated official release identity', () => {
    const release = createBuildInfo('0.2.1', { buildId: 'release-0123456789ab', channel: 'stable' })
    const localStore = new DiagnosticSummaryStore(build, { clock: () => start })
    const releaseStore = new DiagnosticSummaryStore(release, { clock: () => start })
    releaseStore.record(move)
    expect(localStore.getSnapshot().groups).toHaveLength(0)
    expect(releaseStore.getSnapshot().groups[0]).toMatchObject(release)
  })

  it('rejects invalid or over-budget limits and inconsistent build identities', () => {
    for (const maxGroups of [0, -1, 1.5, 21, NaN]) {
      expect(() => new DiagnosticSummaryStore(build, { maxGroups })).toThrow(RangeError)
    }
    for (const maxCount of [0, -1, 1.5, 1_000_001, Infinity]) {
      expect(() => new DiagnosticSummaryStore(build, { maxCount })).toThrow(RangeError)
    }
    expect(() => new DiagnosticSummaryStore({ ...build, buildId: 'PRIVATE_PROJECT', channel: 'stable' })).toThrow(RangeError)
    expect(() => new DiagnosticSummaryStore({ ...build, appVersion: 'file:///private/path' })).toThrow(RangeError)
  })
})

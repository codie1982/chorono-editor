import { describe, expect, it, vi } from 'vitest'
import { createBuildInfo } from '@/lib/version'
import { DIAGNOSTIC_MAX_COUNT, DIAGNOSTIC_SCHEMA_VERSION } from '../contracts/types'
import { convertDiagnosticFailure } from './convertDiagnosticFailure'
import { convertDiagnosticReport } from './convertDiagnosticReport'

const reportId = '35dd0a72-388a-440b-98dc-b34411389502'

/** Representative safe summary uses the public catalogue converter, not a raw
 * trace fixture. Extra raw values in individual cases must never survive it. */
function summary() {
  return { ...createBuildInfo('0.2.0'), ...convertDiagnosticFailure({ failureSite: 'viewport.object-move.commit' })!,
    day: '2026-11-10', occurrenceCount: 1000 }
}

describe('diagnostic failure conversion', () => {
  it('retains only static failure meaning without touching authored data or raw Error', () => {
    const secret = 'PRIVATE_PROJECT_/Users/engin/api_token_clock_09:05'
    const getter = vi.fn(() => secret), toJSON = vi.fn(() => secret)
    const input = { failureSite: 'viewport.object-move.commit', name: secret, coordinates: [1, 2],
      error: new Error(secret), stack: secret, token: secret, context: { text: secret }, toJSON,
      get message() { return getter() } }
    const failure = convertDiagnosticFailure(input)!
    expect(failure).toEqual({ failureSite: 'viewport.object-move.commit', errorCode: 'EDIT_COMMIT_FAILED',
      module: 'viewport', classification: 'known', severity: 'error', sample: { operation: 'move', outcome: 'commit-failed' } })
    expect(JSON.stringify(failure)).not.toContain(secret)
    expect(getter).not.toHaveBeenCalled(); expect(toJSON).not.toHaveBeenCalled()
    expect(Object.isFrozen(failure)).toBe(true); expect(Object.isFrozen(failure.sample)).toBe(true)
    expect(input.name).toBe(secret)
  })

  it.each(['native:blur', 'native:escape', 'below-drag-threshold', 'no-source-change',
    'source-changed', 'document-aborted', 'native:lostpointercapture'])('ignores normal trace/cancel input %s', reason => {
    expect(convertDiagnosticFailure({ owner: 'object-move', event: 'source-cancel', details: { reason } })).toBeUndefined()
    expect(convertDiagnosticFailure({ failureSite: reason })).toBeUndefined()
  })

  it('rejects unknown, inherited, accessor and native-class sites', () => {
    const getter = vi.fn(() => 'viewport.object-move.commit')
    expect(convertDiagnosticFailure({ get failureSite() { return getter() } })).toBeUndefined()
    expect(getter).not.toHaveBeenCalled()
    expect(convertDiagnosticFailure(Object.create({ failureSite: 'viewport.object-move.commit' }))).toBeUndefined()
    expect(convertDiagnosticFailure(Object.assign(new Error('secret'), { failureSite: 'viewport.object-move.commit' }))).toBeUndefined()
    expect(convertDiagnosticFailure({ failureSite: 'viewport.object-move.commit/Users/private' })).toBeUndefined()
    expect(convertDiagnosticFailure(new Proxy({}, { getPrototypeOf() { throw new Error('blocked') } }))).toBeUndefined()
    for (const value of [null, undefined, false, 42, 'viewport.object-move.commit']) expect(convertDiagnosticFailure(value)).toBeUndefined()
  })

  it('labels generic unhandled buckets as unclassified and separates their categories', () => {
    const first = convertDiagnosticFailure({ failureSite: 'application.unhandled-error' })!
    const second = convertDiagnosticFailure({ failureSite: 'application.unhandled-rejection' })!
    expect(first.classification).toBe('unclassified'); expect(second.classification).toBe('unclassified')
    expect(first.errorCode).not.toBe(second.errorCode)
    expect(convertDiagnosticFailure({ failureSite: 'application.render-failed' })?.severity).toBe('fatal')
  })
})

describe('diagnostic report conversion', () => {
  it('round-trips a small versioned immutable report with only one static sample', () => {
    const source = summary(), report = convertDiagnosticReport(source, reportId)!
    expect(report).toEqual({ ...source, schemaVersion: DIAGNOSTIC_SCHEMA_VERSION, reportId })
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
    expect(Object.isFrozen(report)).toBe(true); expect(Object.isFrozen(report.sample)).toBe(true)
    expect(source.occurrenceCount).toBe(1000)
  })

  it('drops unknown fields and sample details without executing getters/toJSON', () => {
    const secret = 'PRIVATE:/home/user/scene.json?token=secret'
    const rawGetter = vi.fn(() => secret), serializer = vi.fn(() => secret)
    const source = { ...summary(), raw: secret, message: secret, projectId: secret, toJSON: serializer,
      sample: { ...summary().sample, get raw() { return rawGetter() }, x: 121, error: new Error(secret) } }
    const report = convertDiagnosticReport(source, reportId)!
    expect(report).toBeDefined(); expect(JSON.stringify(report)).not.toContain(secret)
    expect(Object.keys(report.sample)).toEqual(['operation', 'outcome'])
    expect(rawGetter).not.toHaveBeenCalled(); expect(serializer).not.toHaveBeenCalled()
    expect('raw' in report).toBe(false); expect('projectId' in report).toBe(false)
  })

  it.each([0, -1, 1.2, NaN, Infinity, DIAGNOSTIC_MAX_COUNT + 1, '3'])('rejects invalid count %s', occurrenceCount => {
    expect(convertDiagnosticReport({ ...summary(), occurrenceCount }, reportId)).toBeUndefined()
  })

  it.each(['2026-02-30', '2026-13-01', '2026-11-10T13:05:00Z', 'private', '2026-1-1'])('rejects invalid day %s', day => {
    expect(convertDiagnosticReport({ ...summary(), day }, reportId)).toBeUndefined()
  })

  it('accepts leap day and the saturating count ceiling', () => {
    expect(convertDiagnosticReport({ ...summary(), day: '2024-02-29', occurrenceCount: DIAGNOSTIC_MAX_COUNT }, reportId)).toBeDefined()
  })

  it('rejects forged catalogue metadata and sample values', () => {
    for (const extra of [{ errorCode: 'private' }, { module: 'project' }, { severity: 'secret' },
      { classification: 'unknown' }, { sample: { operation: 'move', outcome: 'private' } }]) {
      expect(convertDiagnosticReport({ ...summary(), ...extra }, reportId)).toBeUndefined()
    }
  })

  it('rejects unsafe release/build metadata, bad IDs and accessor summaries', () => {
    for (const extra of [{ appVersion: '/Users/private' }, { buildId: 'private-install-id' },
      { channel: 'private' }, { buildId: 'release-abcdef123456', channel: 'prerelease' }]) {
      expect(convertDiagnosticReport({ ...summary(), ...extra }, reportId)).toBeUndefined()
    }
    const getter = vi.fn(() => '0.2.0')
    expect(convertDiagnosticReport({ ...summary(), get appVersion() { return getter() } }, reportId)).toBeUndefined()
    expect(getter).not.toHaveBeenCalled()
    expect(convertDiagnosticReport(summary(), 'persistent-user-id')).toBeUndefined()
    expect(convertDiagnosticReport(summary(), '../secret')).toBeUndefined()
    expect(convertDiagnosticReport(summary(), reportId + '\n')).toBeUndefined()
    expect(convertDiagnosticReport(summary(), null)).toBeUndefined()
  })

  it('keeps official build attribution while filtering out extra process metadata', () => {
    const build = createBuildInfo('0.2.1-rc.1', { buildId: 'release-abcdef123456', channel: 'prerelease' })
    const report = convertDiagnosticReport({ ...summary(), ...build, pid: 314, bootId: 'private' }, reportId)!
    expect(report.appVersion).toBe('0.2.1-rc.1'); expect(report.buildId).toBe('release-abcdef123456')
    expect(report.channel).toBe('prerelease'); expect('pid' in report).toBe(false); expect('bootId' in report).toBe(false)
  })
})

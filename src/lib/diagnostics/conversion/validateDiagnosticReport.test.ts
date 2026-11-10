import { describe, expect, it, vi } from 'vitest'
import { createBuildInfo } from '@/lib/version'
import { convertDiagnosticFailure } from './convertDiagnosticFailure'
import { convertDiagnosticReport } from './convertDiagnosticReport'
import { validateDiagnosticReport } from './validateDiagnosticReport'

const report = () => convertDiagnosticReport({ ...createBuildInfo('0.2.0'),
  ...convertDiagnosticFailure({ failureSite: 'viewport.object-move.commit' }),
  day: '2026-11-10', occurrenceCount: 3 }, '35dd0a72-388a-440b-98dc-b34411389502')!

describe('strict diagnostic report validation', () => {
  it('restores the public report into frozen data without retaining input', () => {
    const raw = JSON.parse(JSON.stringify(report())), result = validateDiagnosticReport(raw)!
    expect(result).toEqual(raw); expect(result).not.toBe(raw)
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.sample)).toBe(true)
  })
  it('rejects unknown top-level and sample fields instead of silently cleaning wire data', () => {
    expect(validateDiagnosticReport({ ...report(), secret: '/Users/private' })).toBeUndefined()
    expect(validateDiagnosticReport({ ...report(), sample: { ...report().sample, x: 3 } })).toBeUndefined()
    expect(validateDiagnosticReport({ ...report(), schemaVersion: 99 })).toBeUndefined()
    const missing: Record<string, unknown> = { ...report() }; delete missing.day
    expect(validateDiagnosticReport(missing)).toBeUndefined()
  })
  it('does not call getters, custom serializers, or accept prototype/symbol fields', () => {
    const read = vi.fn(() => '0.2.0'), serialize = vi.fn(() => report())
    expect(validateDiagnosticReport({ ...report(), get appVersion() { return read() } })).toBeUndefined()
    expect(validateDiagnosticReport({ ...report(), toJSON: serialize })).toBeUndefined()
    expect(validateDiagnosticReport({ ...report(), [Symbol('secret')]: 1 })).toBeUndefined()
    expect(validateDiagnosticReport(Object.create(report()))).toBeUndefined()
    expect(read).not.toHaveBeenCalled(); expect(serialize).not.toHaveBeenCalled()
  })
  it('rejects forged counts, static meanings, and malicious/native input', () => {
    for (const extra of [{ occurrenceCount: 0 }, { errorCode: 'private' }, { reportId: '../file' },
      { sample: { operation: 'move', outcome: 'private' } }]) expect(validateDiagnosticReport({ ...report(), ...extra })).toBeUndefined()
    expect(validateDiagnosticReport(new Error('secret'))).toBeUndefined()
    expect(validateDiagnosticReport(new Proxy({}, { ownKeys() { throw new Error('trap') } }))).toBeUndefined()
  })
})

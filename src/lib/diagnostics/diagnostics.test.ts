import { describe, expect, it } from 'vitest'
import { version } from '../../../package.json'
import { applicationBuildInfo } from '@/lib/version'
import { DiagnosticSummaryStore, convertDiagnosticReport, DIAGNOSTIC_SCHEMA_VERSION } from './index'

describe('public diagnostic summary pipeline', () => {
  it('uses the real application version and emits one code-only occurrence summary', () => {
    const store = new DiagnosticSummaryStore(applicationBuildInfo, { clock: () => Date.UTC(2026, 10, 10, 13) })
    const raw = { failureSite: 'viewport.shape-placement.commit', scene: { secret: 'private scene title' },
      error: new Error('private filesystem/token'), x: 140, layerId: 'customer-123' }
    expect(store.getSnapshot().groups).toHaveLength(0)
    expect(store.record(raw)).toBe('recorded'); expect(store.record(raw)).toBe('recorded')
    const group = store.getSnapshot().groups[0]
    const report = convertDiagnosticReport(group, '48d24580-7377-407e-8510-6933f5e27953')!
    expect(report.appVersion).toBe(version)
    expect(report.schemaVersion).toBe(DIAGNOSTIC_SCHEMA_VERSION)
    expect(report.occurrenceCount).toBe(2); expect(report.day).toBe('2026-11-10')
    expect(JSON.stringify(report)).not.toMatch(/private|customer-123|140|filesystem|token/)
    // Building/rebuilding a delivery value cannot count another occurrence.
    expect(convertDiagnosticReport(group, report.reportId)).toEqual(report)
    expect(store.getSnapshot().groups[0].occurrenceCount).toBe(2)
    store.clear(); expect(store.getSnapshot().groups).toHaveLength(0)
    expect(report.occurrenceCount).toBe(2)
  })
})

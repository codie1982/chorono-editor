import { describe, expect, it } from 'vitest'
import { DiagnosticConsentRepository, DIAGNOSTIC_CONSENT_KEY } from './DiagnosticConsentRepository'
import { createDiagnosticConfiguration } from './configuration'

const config = createDiagnosticConfiguration('http://127.0.0.1:2000/api/diagnostics/reports', 'Local test service')!
const id = '35dd0a72-388a-440b-98dc-b34411389502'
function memory() { const values = new Map<string, string>(); return { values,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value) },
  removeItem: (key: string) => { values.delete(key) } } }

describe('persistent diagnostic consent', () => {
  it.each(['allowed', 'denied', 'dismissed'] as const)('retains %s across new tab/runtime owners', choice => {
    const storage = memory(), first = new DiagnosticConsentRepository(storage, config, () => id)
    expect(first.read().choice).toBe('unknown')
    first.write(choice)
    const reopened = new DiagnosticConsentRepository(storage, config, () => id)
    expect(reopened.read()).toEqual({ choice, generation: id, endpoint: config.endpoint, policyVersion: 'summary-v1' })
    expect(Object.isFrozen(reopened.read())).toBe(true)
  })
  it('invalidates existing work when permission is revoked without requiring another prompt', () => {
    let next = id; const storage = memory(), owner = new DiagnosticConsentRepository(storage, config, () => next)
    const before = owner.write('allowed')
    next = '48d24580-7377-407e-8510-6933f5e27953'
    const after = owner.write('denied')
    expect(after.generation).not.toBe(before.generation)
    expect(new DiagnosticConsentRepository(storage, config, () => id).read().choice).toBe('denied')
  })
  it('does not accept old policy, another destination, corrupt/extra fields or fake generations', () => {
    const storage = memory(), owner = new DiagnosticConsentRepository(storage, config, () => id)
    owner.write('allowed'); const good = JSON.parse(storage.getItem(DIAGNOSTIC_CONSENT_KEY)!)
    for (const extra of [{ policyVersion: 'old' }, { endpoint: 'https://other.test/reports' },
      { raw: 'secret' }, { generation: 'user-id' }, { choice: true }]) {
      storage.setItem(DIAGNOSTIC_CONSENT_KEY, JSON.stringify({ ...good, ...extra }))
      expect(owner.read().choice).toBe('unknown')
    }
    storage.setItem(DIAGNOSTIC_CONSENT_KEY, '{'); expect(owner.read().choice).toBe('unknown')
    storage.setItem(DIAGNOSTIC_CONSENT_KEY, 'x'.repeat(5000)); expect(owner.read().choice).toBe('unknown')
  })
  it('fails closed on denied storage or an unpersisted choice', () => {
    const owner = new DiagnosticConsentRepository({ getItem: () => null, setItem: () => {}, removeItem: () => {} }, config, () => id)
    expect(() => owner.write('allowed')).toThrow('unavailable')
    const blocked = new DiagnosticConsentRepository({ getItem() { throw Error('denied') }, setItem() {}, removeItem() {} }, config, () => id)
    expect(() => blocked.read()).toThrow('denied')
  })
})

describe('diagnostic deployment configuration', () => {
  it('accepts explicit HTTPS service or local development without inventing a destination', () => {
    expect(createDiagnosticConfiguration(undefined, undefined)).toBeNull()
    expect(createDiagnosticConfiguration('https://errors.example.test/api/diagnostics/reports', 'Chorono')?.versionEndpoint)
      .toBe('https://errors.example.test/api/diagnostics/version')
    expect(config.endpoint).toBe('http://127.0.0.1:2000/api/diagnostics/reports')
  })
  it.each(['http://remote.example.test/api/diagnostics/reports', 'javascript:alert(1)', '//example.test/reports',
    'https://user:secret@example.test/reports', 'https://example.test/reports?token=secret',
    'https://example.test/reports#secret', 'https://example.test/wrong'])('rejects unsafe target %s', endpoint => {
    expect(createDiagnosticConfiguration(endpoint, 'Chorono')).toBeNull()
  })
})

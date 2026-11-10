import { utf8ByteLength } from '@/lib/format/json'
import type { DiagnosticSharingConfiguration } from './configuration'

export const DIAGNOSTIC_CONSENT_KEY = 'chorono.diagnostics.consent.v1'
export type DiagnosticConsentChoice = 'unknown' | 'allowed' | 'denied' | 'dismissed'
export interface DiagnosticConsent {
  readonly choice: DiagnosticConsentChoice
  readonly generation: string
  readonly endpoint: string
  readonly policyVersion: 'summary-v1'
}
export interface DiagnosticPreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Persistent, origin-scoped preference adapter, separate from local tracing.
 * Stores no installation/person ID. Generation is local revocation ownership,
 * never uploaded. A matching policy/destination survives normal app upgrades.
 * Read/write failure is explicit so callers must fail closed; no memory-only
 * allowed consent is returned. The caller owns cross-tab event subscriptions. */
export class DiagnosticConsentRepository {
  constructor(private readonly storage: DiagnosticPreferenceStorage,
    private readonly configuration: DiagnosticSharingConfiguration,
    private readonly randomId: () => string) {}

  /** Read a small strict preference. Missing/mismatched/corrupt data returns
   * unknown (not permission). Storage exceptions propagate to the fail-closed
   * browser owner. No raw Interaction data is inspected or imported. */
  read(): DiagnosticConsent {
    const unknown = Object.freeze({ choice: 'unknown' as const, generation: '',
      endpoint: this.configuration.endpoint, policyVersion: this.configuration.policyVersion })
    const raw = this.storage.getItem(DIAGNOSTIC_CONSENT_KEY)
    if (!raw) return unknown
    try {
      utf8ByteLength(raw, 4096)
      const value = JSON.parse(raw)
      if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
        Object.keys(value).sort().join(',') !== 'choice,endpoint,generation,policyVersion,schemaVersion' ||
        value.schemaVersion !== 1 || !['allowed', 'denied', 'dismissed'].includes(value.choice) ||
        !validGeneration(value.generation) || value.endpoint !== this.configuration.endpoint ||
        value.policyVersion !== this.configuration.policyVersion) return unknown
      return Object.freeze({ choice: value.choice, generation: value.generation,
        endpoint: value.endpoint, policyVersion: value.policyVersion })
    } catch { return unknown }
  }

  /** Persist a deliberate UI decision and verify the durable value before it
   * can authorize anything. Every change invalidates prior async work. Unknown
   * is not writable; closing the prompt writes dismissed. Throws on denied
   * storage or invalid random ID; caller keeps sharing disabled in that case. */
  write(choice: Exclude<DiagnosticConsentChoice, 'unknown'>): DiagnosticConsent {
    if (!['allowed', 'denied', 'dismissed'].includes(choice)) throw new RangeError('Invalid consent choice.')
    const generation = this.randomId()
    if (!validGeneration(generation)) throw new RangeError('Invalid consent generation.')
    const value = { schemaVersion: 1, choice, generation, endpoint: this.configuration.endpoint,
      policyVersion: this.configuration.policyVersion }
    this.storage.setItem(DIAGNOSTIC_CONSENT_KEY, JSON.stringify(value))
    const stored = this.read()
    if (stored.generation !== generation || stored.choice !== choice) throw new Error('Preference storage is unavailable.')
    return stored
  }
}

/** A random per-decision lease, not a client identity. */
function validGeneration(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
}

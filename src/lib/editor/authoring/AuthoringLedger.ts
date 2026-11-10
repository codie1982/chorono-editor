import type { AuthoringRecord, SceneAuthoring } from '../../types/authoring'
import { AUTHORING_LIMITS } from './AuthoringValidation'

/** One commit's bounded mutable record builder. Borrows immutable records;
 * never owns scene values or resources. Admission evicts whole oldest records
 * before growing beyond record/field/encoded-character limits, so omitted data
 * becomes unknown rather than retaining a stale writer. Undo/history own the
 * resulting immutable JSON snapshot; dropping this builder ends its lifetime.
 */
export class AuthoringLedger {
  private readonly records = new Map<string, { value: AuthoringRecord; chars: number; fields: number }>()
  private chars = 64
  private fields = 0
  private incomplete: boolean

  constructor(source: SceneAuthoring | undefined, active: ReadonlySet<string>, ambiguous = false) {
    this.incomplete = !!source?.truncated || ambiguous
    for (const [key, value] of Object.entries(source?.records ?? {})) if (active.has(key)) this.set(key, value)
  }

  /** Remove deleted/untrackable entities. No attribution tombstones accumulate. */
  delete(key: string): void {
    const old = this.records.get(key)
    if (old) { this.records.delete(key); this.chars -= old.chars; this.fields -= old.fields }
  }

  /** Replace one last-writer record, coalescing repeated edits at that address. */
  set(key: string, value: AuthoringRecord): void {
    this.delete(key)
    const fields = Object.keys(value.fields).length, chars = JSON.stringify([key, value]).length + 1
    if (chars > AUTHORING_LIMITS.chars - 128 || fields > AUTHORING_LIMITS.fields) { this.incomplete = true; return }
    while (this.records.size >= AUTHORING_LIMITS.records || this.chars + chars > AUTHORING_LIMITS.chars - 64 || this.fields + fields > AUTHORING_LIMITS.fields) {
      const oldest = this.records.keys().next().value
      if (oldest === undefined) break
      this.delete(oldest); this.incomplete = true
    }
    this.records.set(key, { value, chars, fields }); this.chars += chars; this.fields += fields
  }

  /** Explicit omission is observable; no guessed actor fills missing data. */
  markIncomplete(): void { this.incomplete = true }
  get size(): number { return this.records.size }

  /** Return caller-owned map over borrowed immutable attribution records. */
  toData(): SceneAuthoring {
    return { version: 1, records: Object.fromEntries(Array.from(this.records, ([key, entry]) => [key, entry.value])),
      ...(this.incomplete ? { truncated: true as const } : {}) }
  }
}

import type { ChronoScene } from '../../types'
import type { AuthoringHints, AuthoringRecord, AuthoringStamp } from '../../types/authoring'
import { indexSourceEntities, authoringKey } from './SourceEntities'
import { changedEntityFields } from './FieldChanges'
import { AUTHORING_LIMITS, assertAuthoringData } from './AuthoringValidation'
import { AuthoringLedger } from './AuthoringLedger'

export const UNKNOWN_WRITER: AuthoringStamp = Object.freeze({ actor: Object.freeze({ kind: 'unknown' }) })

/** Attribute one committed source transition. Pure, deterministic for supplied
 * stamp/hints; inputs and their records are borrowed read-only. Only changed
 * entity/field records are allocated. New entities have separate creation and
 * content origins; explicit clone maps inherit content attribution. Missing
 * legacy/ambiguous identities stay unknown, never inferred from parents/names.
 * Root metadata from an edit payload is ignored; only restore accepts a saved,
 * validated ledger. This is a sparse latest-writer ledger, not a transaction log.
 * Capacity evicts whole records to unknown rather than reporting stale actors.
 * Called once on commit, never during preview/evaluation or undo/redo replay.
 */
export function attributeSourceChange(before: ChronoScene, next: ChronoScene, stamp: AuthoringStamp, hints: AuthoringHints = {}): ChronoScene {
  if (hints.mode === 'restore') { assertAuthoringData(next.authoring); return next }
  const previous = indexSourceEntities(before), current = indexSourceEntities(next)
  const records = new AuthoringLedger(before.authoring, new Set(current.entries.keys()), current.ambiguous.size > 0)
  const copies = new Map((hints.copies ?? []).map(copy => [authoringKey(copy.to), authoringKey(copy.from)]))
  const imported = { ...stamp, actor: { kind: 'import' as const } }
  let changed = false
  if (hints.incomplete) records.markIncomplete()
  for (const [key, entity] of Array.from(current.entries)) {
    const old = previous.entries.get(key), sourceKey = copies.get(key)
    const source = sourceKey ? previous.entries.get(sourceKey) : undefined
    const existing = before.authoring?.records[key], inherited = sourceKey ? before.authoring?.records[sourceKey] : undefined
    const fields = old ? changedEntityFields(old, entity) : source ? changedEntityFields(source, entity) : []
    if (old && !fields.length) continue
    changed = true
    const writer = !old && hints.mode === 'import' ? imported : stamp
    const base = old ? existing : inherited
    const fieldWriters = { ...(base?.fields ?? {}) }
    for (const field of fields) {
      // Replacing a whole object supersedes previous nested writer exceptions.
      const prefix = field.slice(0, -1) + ','
      for (const previousField of Object.keys(fieldWriters)) if (previousField.startsWith(prefix)) delete fieldWriters[previousField]
      fieldWriters[field] = writer
    }
    if (Object.keys(fieldWriters).some(field => field.length > 4096) || Object.keys(fieldWriters).length > AUTHORING_LIMITS.fields) {
      records.delete(key); records.markIncomplete(); continue
    }
    const creation = old || previous.ambiguous.has(key) ? existing?.createdBy ?? UNKNOWN_WRITER : writer
    const item: AuthoringRecord = { address: entity.address, createdBy: creation, lastWriter: writer,
      baseWriter: base?.baseWriter ?? (old || sourceKey || hints.incomplete || previous.ambiguous.has(key) ? UNKNOWN_WRITER : writer), fields: fieldWriters,
      ...(source ? { inheritedFrom: source.address } : existing?.inheritedFrom ? { inheritedFrom: existing.inheritedFrom } : {}) }
    records.set(key, item)
  }
  // Oldest retained records go first. No append-only stamps/tombstones survive
  // entity deletion; history itself owns earlier immutable ledger snapshots.
  const ledger = records.toData()
  if (!changed && records.size === Object.keys(before.authoring?.records ?? {}).length && next.authoring === before.authoring && ledger.truncated === before.authoring?.truncated) return next
  if (!records.size && !before.authoring && !changed && !ledger.truncated) {
    const { authoring: _ignored, ...source } = next; return source
  }
  return { ...next, authoring: ledger }
}

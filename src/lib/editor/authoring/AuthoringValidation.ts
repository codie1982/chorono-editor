import type { SceneAuthoring } from '../../types/authoring'

export const AUTHORING_LIMITS = Object.freeze({ records: 8000, fields: 16000, chars: 2 * 1024 * 1024 })
const actorKinds = new Set(['human', 'agent', 'import', 'unknown'])
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
const address = (value: unknown) => {
  if (!Array.isArray(value) || !value.every(part => text(part, 512) && part.length > 0)) return false
  const lengths: Record<string, number> = { scene: 1, layer: 2, timeline: 2, track: 3, key: 4, spline: 4, entity: 3 }
  if (!Object.hasOwn(lengths, value[0]) || value.length !== lengths[value[0]]) return false
  return value[0] !== 'spline' || ['points', 'handles', 'segments', 'contours', 'subShapes'].includes(value[2])
}

/** Validate optional versioned editor metadata at JSON/MCP boundaries. Old
 * sources without it stay untouched/unknown. Reject malformed/future versions
 * before scene replacement; do not silently rewrite content or trust actors as
 * credentials. Limits bound persisted attribution, not physical process RAM.
 */
export function assertAuthoringData(value: unknown): asserts value is SceneAuthoring | undefined {
  if (value === undefined) return
  const fail = () => { throw new Error('Invalid or unsupported editor authoring metadata') }
  const stamp = (s: any) => record(s) && record(s.actor) && actorKinds.has(s.actor.kind) &&
    (s.actor.name === undefined || text(s.actor.name, 80)) &&
    (s.transactionId === undefined || text(s.transactionId, 128)) && (s.requestId === undefined || text(s.requestId, 128)) &&
    Object.keys(s).every(key => ['actor', 'transactionId', 'requestId'].includes(key)) && Object.keys(s.actor).every(key => ['kind', 'name'].includes(key))
  if (!record(value) || value.version !== 1 || !record(value.records) || (value.truncated !== undefined && value.truncated !== true) || Object.keys(value).some(key => !['version', 'records', 'truncated'].includes(key))) return fail()
  const records = Object.entries(value.records)
  if (records.length > AUTHORING_LIMITS.records) return fail()
  let fields = 0
  for (const [key, item] of records) {
    if (!record(item) || !address(item.address) || JSON.stringify(item.address) !== key || !stamp(item.createdBy) || !stamp(item.lastWriter) || !stamp(item.baseWriter) || !record(item.fields) || (item.inheritedFrom !== undefined && !address(item.inheritedFrom))) return fail()
    if (Object.keys(item).some(name => !['address', 'createdBy', 'lastWriter', 'baseWriter', 'fields', 'inheritedFrom'].includes(name))) return fail()
    for (const [path, writer] of Object.entries(item.fields)) {
      fields++
      if (path.length > 4096 || !stamp(writer)) return fail()
      let parts: unknown; try { parts = JSON.parse(path) } catch { return fail() }
      if (!Array.isArray(parts) || parts.length > 32 || !parts.every(part => text(part, 512)) || JSON.stringify(parts) !== path) return fail()
    }
  }
  if (fields > AUTHORING_LIMITS.fields || JSON.stringify(value).length > AUTHORING_LIMITS.chars) return fail()
}

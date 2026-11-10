import { LayerIndex } from '../../scene/LayerIndex'
import { parseTrackTarget } from '../../timeline/TrackTargetParser'
import type { ChronoScene } from '../../types'
import type { AuthoringAddress, AuthoringStamp } from '../../types/authoring'
import { authoringKey, indexSourceEntities } from './SourceEntities'
import { UNKNOWN_WRITER } from './Attribution'

/** Read one field's latest writer. A nearest containing field replacement wins
 * over original content. Missing/evicted/deleted/ambiguous records are unknown.
 * Paths are property segments, not dotted strings or legacy array indices.
 * Result is borrowed read-only metadata; no source or history changes occur.
 */
export function fieldAuthoring(scene: ChronoScene, address: AuthoringAddress, field: readonly string[]): AuthoringStamp {
  const key = authoringKey(address)
  if (!indexSourceEntities(scene).entries.has(key)) return UNKNOWN_WRITER
  const item = scene.authoring?.records[key]
  if (!item) return UNKNOWN_WRITER
  if (field.length === 1 && field[0] === 'id') return item.createdBy
  const prefix = authoringKey(field).slice(0, -1) + ','
  if (Object.keys(item.fields).some(path => path.startsWith(prefix))) return UNKNOWN_WRITER
  for (let length = field.length; length >= 0; length--) {
    const writer = item.fields[authoringKey(field.slice(0, length))]
    if (writer) return writer
  }
  return item.baseWriter
}

/** Describe local contribution kinds without claiming parent ownership of
 * children. includeDescendants explicitly includes a layer's subtree, its spline
 * elements and target tracks/keys. Different actor names of the same kind are
 * retained in actors; origin is mixed when multiple kinds contributed. Absent
 * attribution stays unknown even on otherwise agent-authored parent groups.
 */
export function describeAuthoring(scene: ChronoScene, address: AuthoringAddress, includeDescendants = false) {
  const index = indexSourceEntities(scene), key = authoringKey(address), item = index.entries.has(key) ? scene.authoring?.records[key] : undefined
  const actors = new Map<string, AuthoringStamp['actor']>()
  const add = (writer: AuthoringStamp) => actors.set(JSON.stringify(writer.actor), writer.actor)
  const include = (entityKey: string) => {
    const record = scene.authoring?.records[entityKey]
    if (!record) { add(UNKNOWN_WRITER); return }
    add(record.createdBy); add(record.baseWriter); Object.values(record.fields).forEach(add)
  }
  if (!index.entries.has(key)) add(UNKNOWN_WRITER)
  else include(key)
  if (includeDescendants && address[0] === 'layer') {
    const ids = new LayerIndex(scene.layers).subtreeIds([address[1]])
    for (const [entityKey, entity] of Array.from(index.entries)) {
      const a = entity.address
      if ((a[0] === 'layer' || a[0] === 'spline') && ids.has(a[1]) || (a[0] === 'key' || a[0] === 'track') && ids.has(parseTrackTarget(a[2])?.entityId ?? '')) include(entityKey)
    }
  }
  const kinds = new Set(Array.from(actors.values(), actor => actor.kind))
  return { origin: kinds.size === 1 ? kinds.values().next().value! : 'mixed' as const,
    createdBy: item?.createdBy ?? UNKNOWN_WRITER, lastWriter: item?.lastWriter ?? UNKNOWN_WRITER,
    actors: Array.from(actors.values()), inheritedFrom: item?.inheritedFrom, truncated: !!scene.authoring?.truncated }
}

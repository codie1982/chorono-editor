import type { ChronoScene } from '../../types'
import type { AuthoringAddress } from '../../types/authoring'

export interface SourceEntity { readonly address: AuthoringAddress; readonly value: unknown; readonly omit: ReadonlySet<string> }
export interface SourceEntityIndex { readonly entries: Map<string, SourceEntity>; readonly ambiguous: Set<string> }
const empty = new Set<string>()
const collections = ['assets', 'assetCollections', 'parameters', 'triggers', 'bindings', 'parameterWires', 'stateMachines'] as const
const splineTables = ['points', 'handles', 'segments', 'contours', 'subShapes'] as const
const rootOmit = new Set(['authoring', 'layers', 'timelines', ...collections])
const layerOmit = new Set(splineTables.map(table => JSON.stringify(['spline', table])))

/** Canonical dictionary key. Tuple encoding preserves punctuation in source IDs. */
export function authoringKey(address: readonly string[]): string { return JSON.stringify(address) }

/** Build a temporary borrowed view of stable source entities. No dense source
 * values enter the persisted ledger. Nested tracks/keys/spline tables are owned
 * by their own identity, not credited as an edit to every ancestor. Arbitrary
 * arrays stay atomic fields. Duplicate/missing legacy IDs remain ambiguous.
 * O(entity count) transient references; discard after commit/query, never cache
 * across documents or retain in history. Source and evaluator data are unchanged.
 */
export function indexSourceEntities(scene: ChronoScene): SourceEntityIndex {
  const entries = new Map<string, SourceEntity>(), ambiguous = new Set<string>()
  const add = (address: AuthoringAddress, value: unknown, omit = empty) => {
    if (address.some(part => typeof part !== 'string' || !part || part.length > 512)) { ambiguous.add(authoringKey(address)); return }
    const key = authoringKey(address)
    if (entries.has(key) || ambiguous.has(key)) { entries.delete(key); ambiguous.add(key); return }
    entries.set(key, { address, value, omit })
  }
  add(['scene'], scene, rootOmit)
  for (const layer of scene.layers) {
    add(['layer', layer.id], layer, layerOmit)
    for (const table of splineTables) for (const [id, value] of Object.entries(layer.spline?.[table] ?? {})) add(['spline', layer.id, table, id], value)
  }
  for (const timeline of scene.timelines) {
    add(['timeline', timeline.id], timeline, new Set(['tracks']))
    for (const track of timeline.tracks) {
      add(['track', timeline.id, track.target], track, new Set(['keyframes']))
      for (const key of track.keyframes) if (typeof key.id === 'string') add(['key', timeline.id, track.target, key.id], key)
    }
  }
  for (const collection of collections) for (const item of scene[collection] ?? []) add(['entity', collection, item.id], item, collection === 'assets' ? new Set(['runtime']) : empty)
  return { entries, ambiguous }
}

/** Whether a field is delegated to a separate stable entity, or runtime-only. */
export function omitsEntityField(entity: SourceEntity, path: readonly string[]): boolean {
  return (path.length === 1 && (path[0] === 'id' || entity.omit.has(path[0]))) || entity.omit.has(authoringKey(path))
}

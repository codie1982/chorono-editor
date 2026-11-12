import type { ChronoScene } from '../../types'
import { nextKfId } from '../../defaults'

/** A transient source-key insertion address, independent of pointer value. */
export interface TrajectoryKeyIdAddress { target: string; timeMs: number; role: 'node' | 'support' }
export type TrajectoryKeyIdAllocator = (address: Readonly<TrajectoryKeyIdAddress>) => string

/** Own one gesture's insertion-ID reservations. Reuse this function while
 * rebuilding previews against the same source snapshot, then discard it when
 * the gesture commits/cancels or its source changes. Values do not enter the
 * address, so sparse node/support IDs stay stable as the pointer moves. Only
 * strings are retained; this allocator is runtime state, never scene JSON. */
export function createTrajectoryKeyIdAllocator(nextId: () => string = nextKfId): TrajectoryKeyIdAllocator {
  const ids = new Map<string, string>()
  return address => {
    const key = addressKey(address)
    let id = ids.get(key)
    if (id === undefined) { id = nextId(); ids.set(key, id) }
    return id
  }
}

/** Validate IDs from an optional UI reservation owner against this source and
 * every insertion in the prepared command. A stale/broken allocator cannot
 * silently duplicate an existing UUID or assign one UUID to two addresses.
 * Existing UUIDs are scanned only on the first actual insertion; paired-key
 * value edits retain no whole-scene key index or temporary flattened arrays. */
export function guardedTrajectoryKeyIds(scene: ChronoScene, allocate?: TrajectoryKeyIdAllocator): TrajectoryKeyIdAllocator {
  let existing: Set<string> | undefined
  const byAddress = new Map<string, string>(), byId = new Map<string, string>()
  return address => {
    const key = addressKey(address), reserved = byAddress.get(key)
    if (reserved !== undefined) return reserved
    if (!existing) {
      existing = new Set<string>()
      for (const timeline of scene.timelines) for (const track of timeline.tracks) {
        for (const sourceKey of track.keyframes) existing.add(sourceKey.id)
      }
    }
    const id = allocate?.(address) ?? nextKfId()
    if (typeof id !== 'string' || !id || existing.has(id) || (byId.has(id) && byId.get(id) !== key)) {
      throw new Error('A reserved trajectory key ID collides with source data. Start a fresh gesture.')
    }
    byAddress.set(key, id); byId.set(id, key)
    return id
  }
}

/** JSON tuple encoding keeps arbitrary property-target strings unambiguous. */
function addressKey(address: Readonly<TrajectoryKeyIdAddress>): string { return JSON.stringify([address.target, address.timeMs, address.role]) }

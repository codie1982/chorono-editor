import type { AuthoringHints } from '../types/authoring'
import type { ChronoScene, Timeline } from '../types'
import { nextKfId } from '../defaults'

/** Preserve animation with independent key IDs. Optional caller-owned copies
 * receives exact identity lineage at allocation; no source/ledger is mutated. */
export function cloneTimeline(scene: ChronoScene, sourceId: string, newId: string, copies?: NonNullable<AuthoringHints['copies']>[number][]): Timeline {
  const source = scene.timelines.find((timeline) => timeline.id === sourceId)
  if (!source || !newId || scene.timelines.some((timeline) => timeline.id === newId)) {
    throw new Error('Source must exist and new timeline id must be unique')
  }
  const usedIds = new Set(scene.timelines.flatMap((timeline) =>
    timeline.tracks.flatMap((track) => track.keyframes.map((key) => key.id))))
  const copy = structuredClone(source)
  copy.id = newId
  copies?.push({ from: ['timeline', sourceId], to: ['timeline', newId] })
  for (const track of copy.tracks) {
    copies?.push({ from: ['track', sourceId, track.target], to: ['track', newId, track.target] })
    for (const key of track.keyframes) {
      let id: string
      do { id = nextKfId() } while (usedIds.has(id))
      usedIds.add(id)
      copies?.push({ from: ['key', sourceId, track.target, key.id], to: ['key', newId, track.target, id] })
      key.id = id
    }
  }
  return copy
}

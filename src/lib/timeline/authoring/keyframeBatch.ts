import type { ChronoScene, Keyframe, Track } from '../../types'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { boundedKeyTime, compareKeyTime, sameKeyTime } from './keyTimePolicy'

export type KeyCollisionPolicy = 'reject' | 'overwrite'
export interface KeyTimeMove { timelineId: string; target: string; kfId: string; fromMs: number; toMs: number }
export interface KeyInsertion { timelineId: string; target: string; kf: Keyframe }
export interface KeyframeBatch { moves?: readonly KeyTimeMove[]; insertions?: readonly KeyInsertion[] }
export interface KeyframeBatchOptions { collisionPolicy?: KeyCollisionPolicy }

/** Simultaneous immutable source edit. All identities, times and collisions
 * validate before returning any scene. Swapping selected keys is supported;
 * no sequential intermediate collisions. Default rejects collisions; explicit
 * overwrite removes only untouched keys at the destination, never another
 * edited member. Keeps IDs, values, easing/tangents/segment metadata intact.
 * Unaffected duplicate legacy times are preserved, not silently repaired.
 * Complexity O(source keys + per-affected-track sorting); no DOM/history state.
 */
export function applyKeyframeBatch(scene: ChronoScene, batch: KeyframeBatch, options: KeyframeBatchOptions = {}): ChronoScene {
  const operations = [...(batch.moves ?? []), ...(batch.insertions ?? [])]
  if (!operations.length) return scene
  const groups = new Map<string, Map<string, { moves: KeyTimeMove[]; inserts: KeyInsertion[] }>>()
  const trackTargets = new Map(scene.timelines.map(timeline => [timeline.id, new Set(timeline.tracks.map(track => track.target))]))
  for (const item of operations) {
    if (!trackTargets.get(item.timelineId)?.has(item.target)) throw new Error(`Missing timeline or track: ${item.target}. No keys were changed.`)
    let targets = groups.get(item.timelineId)
    if (!targets) { targets = new Map(); groups.set(item.timelineId, targets) }
    let group = targets.get(item.target)
    if (!group) { group = { moves: [], inserts: [] }; targets.set(item.target, group) }
    if ('kfId' in item) group.moves.push(item); else group.inserts.push(item)
  }
  return { ...scene, timelines: scene.timelines.map(timeline => {
    const targets = groups.get(timeline.id)
    if (!targets) return timeline
    return { ...timeline, tracks: timeline.tracks.map(track => {
      const group = targets.get(track.target)
      if (!group) return track
      const touched = new Set<string>(), replacements = new Map<string, Keyframe>()
      const byId = new Map<string, Keyframe>(), duplicates = new Set<string>()
      for (const key of track.keyframes) { if (byId.has(key.id)) duplicates.add(key.id); byId.set(key.id, key) }
      for (const move of group.moves) {
        const original = byId.get(move.kfId)
        if (!original || duplicates.has(move.kfId) || !sameKeyTime(original.timeMs, move.fromMs) || touched.has(move.kfId)) throw new Error('The key selection changed. Repeat the edit from current source.')
        touched.add(move.kfId)
        replacements.set(move.kfId, { ...original, timeMs: boundedKeyTime(move.toMs, timeline.durationMs) })
      }
      const inserted = group.inserts.map(item => {
        if (touched.has(item.kf.id) || byId.has(item.kf.id)) throw new Error('Duplicate key identity. No keys were changed.')
        touched.add(item.kf.id)
        return { ...item.kf, timeMs: boundedKeyTime(item.kf.timeMs, timeline.durationMs) }
      })
      const edited = [...Array.from(replacements.values()), ...inserted].sort(compareKeyTime)
      for (let i = 1; i < edited.length; i++) if (sameKeyTime(edited[i - 1].timeMs, edited[i].timeMs)) throw new Error('Edited keys would share a time on the same track. The whole edit was cancelled.')
      const destinations = edited.map(key => key.timeMs)
      // Sorted merge detects destination hits without an O(keys × edits) scan.
      let cursor = 0
      const retained = track.keyframes.filter(key => !touched.has(key.id)).sort(compareKeyTime).filter(key => {
        while (cursor < destinations.length && destinations[cursor] < key.timeMs && !sameKeyTime(destinations[cursor], key.timeMs)) cursor++
        if (cursor >= destinations.length || !sameKeyTime(destinations[cursor], key.timeMs)) return true
        if (options.collisionPolicy !== 'overwrite') throw new Error(`A key already exists on ${track.target} at ${key.timeMs} ms. No keys were changed; use explicit overwrite to replace it.`)
        return false
      })
      return { ...track, keyframes: [...retained, ...edited].sort(compareKeyTime) }
    }) }
  }) }
}

/** Native command adapter over the shared batch policy. One execution publishes
 * one scene/history entry; undo restores affected timeline snapshots exactly.
 * Callers can validate against a gesture baseline before committing; failures
 * must cancel the gesture rather than retaining its preview. */
export function makeKeyframeBatchCmd(label: string, batch: KeyframeBatch, options: KeyframeBatchOptions = {}): EditorCommand {
  let before = new Map<string, Track[]>()
  const ids = new Set([...(batch.moves ?? []), ...(batch.insertions ?? [])].map(item => item.timelineId))
  return { label, execute(scene) {
    const next = applyKeyframeBatch(scene, batch, options)
    before = new Map(scene.timelines.filter(timeline => ids.has(timeline.id)).map(timeline => [timeline.id, timeline.tracks]))
    return next
  }, undo: scene => ({ ...scene, timelines: scene.timelines.map(timeline => before.has(timeline.id) ? { ...timeline, tracks: before.get(timeline.id)! } : timeline) }) }
}

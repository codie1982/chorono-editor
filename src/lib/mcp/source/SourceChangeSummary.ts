import type { ChronoScene } from '../../types'

export interface SourceChangeSummary {
  readonly addedLayerIds: string[]
  readonly removedLayerIds: string[]
  readonly reparentedLayerIds: string[]
  readonly changedPaths: string[]
  readonly changedKeys: { timelineId: string; target: string; keyId: string; operation: 'added' | 'removed' | 'updated' }[]
  truncated: boolean
}

/** Bounded source-diff description, not another history or scene copy. Paths
 * identify layers/timelines by stable IDs; arbitrary arrays are reported as one
 * field rather than giving array indices permanent identity. Key changes use
 * actual key IDs. Up to 100 entries per category and 10,000 visited values are
 * examined and paths are capped at 512 characters; truncated explicitly
 * prevents treating a partial report as complete.
 * Input is borrowed, never mutated; unchanged references short-circuit. Runs
 * once on actual source commit/undo, never on evaluator or drag preview frames.
 */
export function summarizeSourceChanges(before: ChronoScene, after: ChronoScene): SourceChangeSummary {
  const result: SourceChangeSummary = { addedLayerIds: [], removedLayerIds: [], reparentedLayerIds: [], changedPaths: [], changedKeys: [], truncated: false }
  let visited = 0
  const append = <T>(items: T[], value: T) => { if (items.length < 100) items.push(value); else result.truncated = true }
  const removedKeys = (timelineId: string, target: string, keys: { id: string }[]) => {
    if (target.length > 256) { result.truncated = true; return }
    for (const key of keys.slice(0, 101)) {
      if (typeof key.id !== 'string' || key.id.length > 128) { result.truncated = true; continue }
      append(result.changedKeys, { timelineId, target, keyId: key.id, operation: 'removed' })
    }
    if (keys.length > 100) result.truncated = true
  }
  /** Bounded structural equality avoids marking detached script clones as
   * edits. Undefined means the comparison budget was exhausted, not equal. */
  const equal = (a: unknown, b: unknown, depth = 0): boolean | undefined => {
    if (a === b) return true
    if (++visited > 10_000 || depth > 16) { result.truncated = true; return undefined }
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a) && a.length > 10_000 - visited) { result.truncated = true; return undefined }
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>
    const keys = Object.keys(left).filter(key => left[key] !== undefined)
    if (keys.length !== Object.keys(right).filter(key => right[key] !== undefined).length) return false
    for (const key of keys) {
      if (!Object.hasOwn(right, key)) return false
      const same = equal(left[key], right[key], depth + 1)
      if (same !== true) return same
    }
    return true
  }
  /** Compare JSON records without serializing dense geometry/key buffers.
   * Oversized paths are omitted explicitly rather than publishing false IDs. */
  const compare = (a: unknown, b: unknown, path: string, depth = 0): void => {
    if (a === b) return
    if (++visited > 10_000 || depth > 16 || path.length > 512) { result.truncated = true; return }
    if (result.changedPaths.length >= 100) { result.truncated = true; return }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      const left = a as Record<string, unknown>, right = b as Record<string, unknown>
      for (const key of Array.from(new Set([...Object.keys(left), ...Object.keys(right)]))) {
        if (key.length + path.length > 511) { result.truncated = true; continue }
        compare(left[key], right[key], `${path}.${key}`, depth + 1)
      }
    } else if (Array.isArray(a) && Array.isArray(b)) {
      if (equal(a, b, depth) === false) append(result.changedPaths, path)
    } else append(result.changedPaths, path)
  }
  const previous = new Map(before.layers.map(layer => [layer.id, layer]))
  const current = new Map(after.layers.map(layer => [layer.id, layer]))
  for (const layer of before.layers) if (!current.has(layer.id)) append(result.removedLayerIds, layer.id)
  for (const layer of after.layers) {
    const old = previous.get(layer.id)
    if (!old) append(result.addedLayerIds, layer.id)
    else {
      if (old.parentId !== layer.parentId) append(result.reparentedLayerIds, layer.id)
      compare(old, layer, `layers.${layer.id}`)
    }
  }
  const timelines = new Map(before.timelines.map(timeline => [timeline.id, timeline]))
  for (const timeline of after.timelines) {
    const old = timelines.get(timeline.id)
    if (old === timeline) continue
    const oldTracks = new Map(old?.tracks.map(track => [track.target, track]))
    for (const track of timeline.tracks) {
      const oldTrack = oldTracks.get(track.target)
      if (oldTrack === track) continue
      if ((oldTrack?.keyframes.length ?? 0) + track.keyframes.length > 10_000 - visited) { result.truncated = true; oldTracks.delete(track.target); continue }
      const allKeys = [...(oldTrack?.keyframes ?? []), ...track.keyframes]
      if (allKeys.some(key => typeof key.id !== 'string')) { result.truncated = true; oldTracks.delete(track.target); continue }
      if (new Set(track.keyframes.map(key => key.id)).size !== track.keyframes.length ||
        new Set(oldTrack?.keyframes.map(key => key.id)).size !== (oldTrack?.keyframes.length ?? 0)) {
        result.truncated = true; oldTracks.delete(track.target); continue
      }
      const keys = new Map(oldTrack?.keyframes.map(key => [key.id, key]))
      for (const key of track.keyframes) {
        if (++visited > 10_000) { result.truncated = true; return result }
        const previousKey = keys.get(key.id)
        if (previousKey !== key && equal(previousKey, key) === false) {
          if (track.target.length > 256 || key.id.length > 128) { result.truncated = true; keys.delete(key.id); continue }
          append(result.changedKeys, { timelineId: timeline.id, target: track.target, keyId: key.id, operation: previousKey ? 'updated' : 'added' })
          compare(previousKey, key, `timelines.${timeline.id}.tracks.${track.target}.keys.${key.id}`)
        }
        keys.delete(key.id)
      }
      removedKeys(timeline.id, track.target, Array.from(keys.values()))
      oldTracks.delete(track.target)
    }
    for (const track of Array.from(oldTracks.values())) removedKeys(timeline.id, track.target, track.keyframes)
    compare(old, timeline, `timelines.${timeline.id}`)
  }
  for (const old of before.timelines) if (!after.timelines.some(timeline => timeline.id === old.id)) {
    append(result.changedPaths, `timelines.${old.id}`)
    for (const track of old.tracks) removedKeys(old.id, track.target, track.keyframes)
  }
  if (before.layers.some((layer, index) => layer.id !== after.layers[index]?.id)) append(result.changedPaths, 'layers.$order')
  for (const key of Array.from(new Set([...Object.keys(before), ...Object.keys(after)])) as (keyof ChronoScene)[]) if (key !== 'layers' && key !== 'timelines') compare(before[key], after[key], key)
  return result
}

import type { ChronoScene } from '../types'
import { parseTrackTarget } from '../timeline/TrackTargetParser'

/** Shared source-expansion limits for editor and MCP clone/array admission.
 * They bound source layer/key counts, not process RAM or GPU allocation. */
export const CLONE_WORKLOAD_LIMITS = { layers: 5000, keyframes: 50000 } as const

export interface CloneWorkloadOptions {
  /** Additional placement wrappers per NEW occurrence. */
  extraLayersPerOccurrence?: number
  /** Omit for all relevant timelines; an empty set copies no tracks. */
  timelineIds?: ReadonlySet<string>
}

/** Refuse an expanded forest before allocating copied payloads/IDs.
 * sourceIds must contain the validated, deduplicated forest with descendants.
 * count means NEW occurrences. Existing keys from all timelines consume budget;
 * only selected timelines contribute copied keys. Inputs are never mutated.
 * Throws for invalid count, missing sources, or an expanded workload overflow.
 */
export function assertCloneForestBudget(scene: ChronoScene, sourceIds: ReadonlySet<string>,
  count: number, options: CloneWorkloadOptions = {}): void {
  const extra = options.extraLayersPerOccurrence ?? 0
  if (!Number.isSafeInteger(count) || count < 1 || count > CLONE_WORKLOAD_LIMITS.layers
      || !Number.isSafeInteger(extra) || extra < 0) throw new Error('Clone count limit exceeded')
  const existing = new Set(scene.layers.map(layer => layer.id))
  if (!sourceIds.size || Array.from(sourceIds).some(id => !existing.has(id))) throw new Error('Clone source no longer exists')
  let totalKeys = 0, copiedKeys = 0
  for (const timeline of scene.timelines) for (const track of timeline.tracks) {
    totalKeys += track.keyframes.length
    const target = parseTrackTarget(track.target)
    if ((!options.timelineIds || options.timelineIds.has(timeline.id))
        && target?.entityType === 'layer' && sourceIds.has(target.entityId)) copiedKeys += track.keyframes.length
  }
  if (scene.layers.length + (sourceIds.size + extra) * count > CLONE_WORKLOAD_LIMITS.layers
      || totalKeys + copiedKeys * count > CLONE_WORKLOAD_LIMITS.keyframes) {
    throw new Error('Expanded clone/array workload limit exceeded')
  }
}

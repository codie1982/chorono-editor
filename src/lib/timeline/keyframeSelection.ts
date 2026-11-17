import { parseTrackTarget } from './TrackTargetParser'
import type { ChronoScene, Keyframe } from '../types'

export interface SelectedKeyframe {
  timelineId: string
  target: string
  kf: Keyframe
}

/** A key selection belongs to the active timeline, including legacy files
 * whose separately cloned timelines contain identical key IDs. An optional
 * isolation scope prevents invisible/global targets from bulk editing. */
export function resolveSelectedKeyframes(
  scene: ChronoScene,
  timelineId: string | null,
  selectedIds: ReadonlySet<string>,
  layerScope?: ReadonlySet<string> | null,
): SelectedKeyframe[] {
  const timeline = scene.timelines.find((candidate) => candidate.id === timelineId)
  if (!timeline || selectedIds.size === 0) return []
  return timeline.tracks.flatMap((track) => {
    const owner = layerScope ? parseTrackTarget(track.target) : null
    if (layerScope && (owner?.entityType !== 'layer' || !layerScope.has(owner.entityId))) return []
    return track.keyframes
    .filter((kf) => selectedIds.has(kf.id))
    .map((kf) => ({ timelineId: timeline.id, target: track.target, kf }))
  })
}

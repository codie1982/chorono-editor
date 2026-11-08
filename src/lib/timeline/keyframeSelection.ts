import type { ChronoScene, Keyframe } from '../types'

export interface SelectedKeyframe {
  timelineId: string
  target: string
  kf: Keyframe
}

/** A key selection belongs to the active timeline, including legacy files
 * whose separately cloned timelines contain identical key IDs. */
export function resolveSelectedKeyframes(
  scene: ChronoScene,
  timelineId: string | null,
  selectedIds: ReadonlySet<string>,
): SelectedKeyframe[] {
  const timeline = scene.timelines.find((candidate) => candidate.id === timelineId)
  if (!timeline || selectedIds.size === 0) return []
  return timeline.tracks.flatMap((track) => track.keyframes
    .filter((kf) => selectedIds.has(kf.id))
    .map((kf) => ({ timelineId: timeline.id, target: track.target, kf })))
}

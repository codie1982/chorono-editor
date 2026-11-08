import type { ChronoScene, Keyframe } from '../types'
import { resolveSelectedKeyframes } from './keyframeSelection'

export interface KeyframeClipboardEntry {
  timelineId: string
  target: string
  kf: Keyframe
  relativeMs: number
}

/** Copy only the active animation and keep relative timing across tracks. */
export function collectKeyframeClipboard(
  scene: ChronoScene,
  timelineId: string | null,
  selectedIds: ReadonlySet<string>,
): KeyframeClipboardEntry[] {
  const selected = resolveSelectedKeyframes(scene, timelineId, selectedIds)
  if (selected.length === 0) return []
  const minTime = Math.min(...selected.map(({ kf }) => kf.timeMs))
  return selected.map((entry) => ({
    ...entry,
    kf: structuredClone(entry.kf),
    relativeMs: entry.kf.timeMs - minTime,
  }))
}

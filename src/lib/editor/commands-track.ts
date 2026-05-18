/** Commands for track-level operations (out-of-range behavior, etc.) */

import type { ChronoScene, Track } from '../types/core'
import type { EditorCommand } from './commands-keyframe'
import type { OutOfRangeSettings } from '../animation/out-of-range/types'

/** Update a track's out-of-range behavior settings.
 *  @param timelineId - Timeline containing the track
 *  @param target - Track target (e.g., "layers.card.opacity")
 *  @param prevSettings - Previous out-of-range settings (for undo)
 *  @param nextSettings - New out-of-range settings (for redo) */
export function makeSetOutOfRangeCmd(
  timelineId: string,
  target: string,
  prevSettings: OutOfRangeSettings | undefined,
  nextSettings: OutOfRangeSettings | undefined
): EditorCommand {
  return {
    label: 'Set Out of Range',
    execute: (scene) => updateOutOfRange(scene, timelineId, target, nextSettings),
    undo: (scene) => updateOutOfRange(scene, timelineId, target, prevSettings),
  }
}

/** Internal: Update out-of-range settings for a track. */
function updateOutOfRange(
  scene: ChronoScene,
  timelineId: string,
  target: string,
  outOfRange: OutOfRangeSettings | undefined
): ChronoScene {
  const timeline = scene.timelines.find((t) => t.id === timelineId)
  if (!timeline) return scene

  const trackIdx = timeline.tracks.findIndex((t) => t.target === target)
  if (trackIdx === -1) return scene

  const track = timeline.tracks[trackIdx]
  const updatedTrack: Track = {
    ...track,
    outOfRange,
  }

  return {
    ...scene,
    timelines: scene.timelines.map((t) =>
      t.id === timelineId
        ? {
            ...t,
            tracks: [
              ...t.tracks.slice(0, trackIdx),
              updatedTrack,
              ...t.tracks.slice(trackIdx + 1),
            ],
          }
        : t
    ),
  }
}

import type { ChronoScene, Timeline } from '../../types'
import { computeLocalTime } from '../../evaluator'
import { selectedBranchIds } from '../../scene/hierarchy/editorLayerRows'
import { parseTrackTarget } from '../TrackTargetParser'
import { KEY_TIME_EPSILON_MS } from './keyTimePolicy'

export type TimelineNavigation = 'start' | 'end' | 'previousFrame' | 'nextFrame' | 'previousKey' | 'nextKey' | 'firstKey' | 'lastKey'

/** Explicit local authoring time. Global playback uses the evaluator's existing
 * loop/ping-pong/count mapping; paused/local authoring only clamps and never
 * wraps at duration. Work area is a playback window, not an editing boundary. */
export function authoringTime(timeline: Timeline, timeMs: number, basis: 'globalPlayback' | 'local' = 'local'): number {
  if (!Number.isFinite(timeMs) || !Number.isFinite(timeline.durationMs) || timeline.durationMs < 0) throw new Error('Timeline time and duration must be finite.')
  return Math.max(0, Math.min(timeline.durationMs, basis === 'globalPlayback' ? computeLocalTime(timeline, Math.max(0, timeMs)) : timeMs))
}

/** One navigation scope across toolbar and keyboard. Selection is the union
 * of source subtrees; absent selection addresses the active timeline. Explicit
 * membership and foreign audio routing remain constraints. Off-grid keys and
 * fractional FPS are retained. No source, selection or playback state changes.
 */
export function navigateTimeline(scene: ChronoScene, timelineId: string, localTimeMs: number,
  intent: TimelineNavigation, selectedIds: ReadonlySet<string>, frames = 1): number {
  const timeline = scene.timelines.find(item => item.id === timelineId)
  if (!timeline) return 0
  const time = authoringTime(timeline, localTimeMs), duration = timeline.durationMs
  if (intent === 'start') return 0
  if (intent === 'end') return duration
  if (intent === 'previousFrame' || intent === 'nextFrame') {
    const fps = scene.composition.frameRate
    if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(frames) || frames < 0) return time
    return authoringTime(timeline, time + (intent === 'nextFrame' ? 1 : -1) * frames * 1000 / fps)
  }
  const scope = selectedIds.size ? selectedBranchIds(scene.layers, null, selectedIds) : null
  const byId = new Map(scene.layers.map(layer => [layer.id, layer])), membership = timeline.layerIds ? new Set(timeline.layerIds) : null
  const times: number[] = []
  for (const track of timeline.tracks) {
    const owner = parseTrackTarget(track.target)
    if (owner?.entityType === 'layer') {
      const layer = byId.get(owner.entityId)
      if (!layer || scope && !scope.has(layer.id) || layer.type === 'audio' && layer.audio?.timelineId && layer.audio.timelineId !== timeline.id
        || membership && !membership.has(layer.id) && !(layer.type === 'audio' && !layer.audio?.timelineId)) continue
    } else if (scope) continue
    for (const key of track.keyframes) if (Number.isFinite(key.timeMs) && key.timeMs >= 0 && key.timeMs <= duration) times.push(key.timeMs)
  }
  if (!times.length) return time
  if (intent === 'firstKey') return times.reduce((a, b) => Math.min(a, b), Infinity)
  if (intent === 'lastKey') return times.reduce((a, b) => Math.max(a, b), -Infinity)
  const forward = intent === 'nextKey'
  let destination = forward ? Infinity : -Infinity
  for (const value of times) {
    if (forward && value > time + KEY_TIME_EPSILON_MS) destination = Math.min(destination, value)
    if (!forward && value < time - KEY_TIME_EPSILON_MS) destination = Math.max(destination, value)
  }
  return Number.isFinite(destination) ? destination : time
}

import type { ChronoScene } from '../../types'
import { newTimeline } from '../../defaults'
import { prepareSetKey, type SetKeyOptions, type SetKeyPlan } from './setKey'

/** Explicit outer-editor Set Key convenience for scenes with no Timeline.
 * Callers with existing timelines use ordinary preparation. Stage one at composition duration
 * and prepare keys against it; commit creates both atomically. Previewing or
 * preparing never publishes an empty Timeline. Stable IDs survive redo; stale
 * source fails through the existing Set Key guard. Content hosts do not call it. */
export function prepareInitialSetKey(scene: ChronoScene, options: Omit<SetKeyOptions, 'timelineId'>): SetKeyPlan {
  if (scene.timelines.length) throw new Error('Select an existing Timeline before creating an initial one.')
  const timeline = { ...newTimeline(), durationMs: scene.composition.durationMs, loop: false, autoplay: false }
  const staged = { ...scene, timelines: [timeline] }
  const plan = prepareSetKey(staged, { ...options, timelineId: timeline.id })
  const inner = plan.command
  return { ...plan, activateTimelineId: timeline.id, command: inner ? {
    label: 'Create Timeline and Set Key',
    execute(current) {
      if (current.timelines !== scene.timelines) throw new Error('Source changed. Set keys again.')
      return inner.execute({ ...current, timelines: staged.timelines })
    },
    undo: current => ({ ...current, timelines: scene.timelines }),
  } : null }
}

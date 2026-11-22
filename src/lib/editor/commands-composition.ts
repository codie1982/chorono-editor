import type { ChronoScene, Composition } from '../types'
import type { EditorCommand } from './commands-keyframe'
import { compositionSettingsValid } from '../scene/compositionSettings'

/** Explicit host policy. An omitted Timeline preserves the legacy metadata-only
 * command used by AI/MCP; the main editor supplies its active Timeline ID. */
export interface CompositionUpdateOptions {
  timelineId?: string | null
  label?: string
}

/** Update composition settings and optionally synchronize one main Timeline's
 * duration in one history step. Units remain px, ms and FPS. Synchronization
 * happens only when composition duration actually changes; an FPS/color/size
 * edit must not overwrite a separately authored Timeline duration.
 *
 * Tracks, key times/IDs/easing, work areas, events, markers, segments, loop
 * policies, other Timelines, layers and private content clips are borrowed
 * unchanged. Shortening hides out-of-range keys without deleting or retiming
 * them; extending restores access. FPS is inherited by Timeline consumers from
 * composition, never copied into a second source field or used to rescale ms.
 *
 * Invalid portable settings or a missing explicit synchronization target fail
 * before source mutation. Undo restores the exact execution snapshot; the
 * normal editor history owns attribution and redo. No resources or buffers.
 */
export function makeUpdateCompositionCmd(next: Composition, options: CompositionUpdateOptions = {}): EditorCommand {
  const composition = { ...next }
  let before: ChronoScene | undefined
  return {
    label: options.label ?? 'Update Composition',
    execute: scene => {
      if (!compositionSettingsValid(composition)) throw new Error('Invalid composition dimensions, duration or frame rate')
      const synchronize = composition.durationMs !== scene.composition.durationMs && !!options.timelineId
      const timeline = synchronize ? scene.timelines.find(item => item.id === options.timelineId) : undefined
      if (synchronize && !timeline) throw new Error('The active Timeline no longer exists. Reopen composition settings.')
      before = scene
      return { ...scene, composition, timelines: timeline ? scene.timelines.map(item => item === timeline
        ? { ...item, durationMs: composition.durationMs } : item) : scene.timelines }
    },
    undo: scene => before ?? scene,
  }
}

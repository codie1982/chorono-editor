import type { ChronoScene, Keyframe, Track } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { readPropertyPath } from '../scene/properties/readPropertyPath'
import { assertTrackValues } from '../animation/typedValues'
import { nextKfId } from '@/lib/defaults'
import { assertTimelineEditTarget } from './authoring/timelinePropertyScope'
import type { TimelineAuthoringContext } from './authoring/TimelineAuthoringContext'

/** Add a track and its optional first key together, using execution-time data.
 * Optional host context defaults to the scene; content edits stay within the bound owner/Timeline. Inverse source restoration retains legacy key data.
 */
export function makeAddAnimationCmd(
  timelineId: string, layerId: string, propertyPath: string, timeMs?: number,
  context?: TimelineAuthoringContext,
): EditorCommand {
  const target = `layers.${layerId}.${propertyPath}`
  const keyId = timeMs == null ? undefined : nextKfId()
  let added: Track | undefined
  return {
    label: 'Add Animation',
    execute(scene) {
      // A content host must report a stale/missing owner or target instead of
      // taking the legacy scene caller's missing-layer/Timeline no-op branch.
      if (context?.kind === 'content') assertTimelineEditTarget(scene, timelineId, target, context)
      const timeline = scene.timelines.find(t => t.id === timelineId)
      const layer = scene.layers.find(l => l.id === layerId)
      if (!timeline || !layer) return scene
      assertTimelineEditTarget(scene, timelineId, target, context)
      if (timeline.tracks.some(t => t.target === target)) return scene
      const value = readPropertyPath(layer, propertyPath)
      if (keyId && value === undefined) throw new Error('Set this property on the layer before adding its first key; missing payloads are not created.')
      const keyframes: Keyframe[] = keyId ? [{
        id: keyId,
        timeMs: Math.max(0, Math.min(timeline.durationMs, timeMs!)),
        value: value as import('../types').AnimatableValue,
        easing: { type: 'easeOut' },
      }] : []
      added = { target, keyframes }
      if (keyId) assertTrackValues(added, value)
      return { ...scene, timelines: scene.timelines.map(t => t.id === timelineId ? { ...t, tracks: [...t.tracks, added!] } : t) }
    },
    undo(scene: ChronoScene) {
      if (!added) return scene
      return { ...scene, timelines: scene.timelines.map(t => t.id === timelineId ? { ...t, tracks: t.tracks.filter(track => track.target !== target) } : t) }
    },
  }
}

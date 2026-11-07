import type { ChronoScene, Keyframe, Track } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { nextKfId } from '@/lib/defaults'

/** Add a track and its optional first key together, using execution-time data. */
export function makeAddAnimationCmd(
  timelineId: string, layerId: string, propertyPath: string, timeMs?: number,
): EditorCommand {
  const target = `layers.${layerId}.${propertyPath}`
  const keyId = timeMs == null ? undefined : nextKfId()
  let added: Track | undefined
  return {
    label: 'Add Animation',
    execute(scene) {
      const timeline = scene.timelines.find(t => t.id === timelineId)
      const layer = scene.layers.find(l => l.id === layerId)
      if (!timeline || !layer || timeline.tracks.some(t => t.target === target)) return scene
      let value: unknown = layer
      for (const part of propertyPath.split('.')) value = (value as Record<string, unknown> | undefined)?.[part]
      const keyframes: Keyframe[] = keyId ? [{
        id: keyId,
        timeMs: Math.max(0, Math.min(timeline.durationMs, timeMs!)),
        value: typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' ? value : 0,
        easing: { type: 'easeOut' },
      }] : []
      added = { target, keyframes }
      return { ...scene, timelines: scene.timelines.map(t => t.id === timelineId ? { ...t, tracks: [...t.tracks, added!] } : t) }
    },
    undo(scene: ChronoScene) {
      if (!added) return scene
      return { ...scene, timelines: scene.timelines.map(t => t.id === timelineId ? { ...t, tracks: t.tracks.filter(track => track.target !== target) } : t) }
    },
  }
}

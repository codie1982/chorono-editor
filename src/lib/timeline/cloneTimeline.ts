import type { ChronoScene, Timeline } from '../types'
import { nextKfId } from '../defaults'

/** Preserve the animation, but give its editable keys independent identities. */
export function cloneTimeline(scene: ChronoScene, sourceId: string, newId: string): Timeline {
  const source = scene.timelines.find((timeline) => timeline.id === sourceId)
  if (!source || !newId || scene.timelines.some((timeline) => timeline.id === newId)) {
    throw new Error('Source must exist and new timeline id must be unique')
  }
  const usedIds = new Set(scene.timelines.flatMap((timeline) =>
    timeline.tracks.flatMap((track) => track.keyframes.map((key) => key.id))))
  const copy = structuredClone(source)
  copy.id = newId
  for (const track of copy.tracks) {
    for (const key of track.keyframes) {
      let id: string
      do { id = nextKfId() } while (usedIds.has(id))
      usedIds.add(id)
      key.id = id
    }
  }
  return copy
}

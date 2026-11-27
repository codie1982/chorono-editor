import type { Timeline } from '../../types'
import { parseTrackTarget } from '../../timeline/TrackTargetParser'

/** Drop private clip tracks addressed to removed 3D model instances. Track
 * targets are parsed as layer paths, so another instance or similarly prefixed
 * ID stays intact. This produces new timeline records without mutating input. */
export function removeModelInstanceTracks(timelines: readonly Timeline[], instanceIds: readonly string[]): Timeline[] {
  return removeModelObjectTracks(timelines, instanceIds, [])
}

/** Remove only tracks belonging to deleted imported instances or authored
 * primitives. Stable ID prefixes prevent a reorder from changing ownership. */
export function removeModelObjectTracks(timelines: readonly Timeline[], instanceIds: readonly string[], primitiveIds: readonly string[]): Timeline[] {
  if (!instanceIds.length && !primitiveIds.length) return Array.from(timelines)
  const prefixes = [...instanceIds.map(id => `model3d.content.instances.${id}.`),
    ...primitiveIds.map(id => `model3d.modeling.objectsById.${id}.`)]
  return timelines.map(clip => ({ ...clip, tracks: clip.tracks.filter(track => {
    const target = parseTrackTarget(track.target)
    return !target || target.entityType !== 'layer' || !prefixes.some(prefix => target.propertyPath.startsWith(prefix))
  }) }))
}

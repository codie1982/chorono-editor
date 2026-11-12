import type { Layer, Track } from '../../types'
import { LayerIndex, type LayerLookup } from '../../scene/LayerIndex'
import { layerRegistry } from '../../registry'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'
import { parseTrackTarget } from '../TrackTargetParser'

/** Whether a layer-relative property belongs to the outer 2D Timeline.
 * Registry exclusions describe feature-owned subtrees, not serializer limits.
 * No source, registry or runtime state is changed. Existing kinds without a
 * policy keep their previous custom-channel behavior. */
export function isLayerTimelineProperty(layer: Layer, path: string): boolean {
  const excluded = layerRegistry.findForLayer(layer)?.timelineExcludedPaths
  return !excluded?.some(root => propertyPathsOverlap(root, path))
}

/** Resolve one target against borrowed source. Optional frame-local lookup
 * avoids repeated scans in batch/view operations. Unknown namespaces/owners
 * keep legacy behavior; their normal caller validation remains authoritative. */
export function isTimelineTargetInScope(layers: readonly Layer[], target: string, lookup?: LayerLookup): boolean {
  const parsed = parseTrackTarget(target)
  if (parsed?.entityType !== 'layer') return true
  const layer = lookup ? lookup.get(parsed.entityId) : layers.find(item => item.id === parsed.entityId)
  return !layer || isLayerTimelineProperty(layer, parsed.propertyPath)
}

/** Reject a new 2D authoring edit before publishing a source/history change.
 * Save/open, evaluation, clone and undo snapshot restoration do not call this
 * guard, so earlier internal tracks survive without becoming authorable here. */
export function assertTimelineTargetInScope(layers: readonly Layer[], target: string, lookup?: LayerLookup): void {
  if (!isTimelineTargetInScope(layers, target, lookup)) throw new Error('Internal content properties cannot be edited on the 2D Timeline. Use static Properties; isolated content editing is planned.')
}

/** Borrow a filtered track list for one known layer; never drop persisted keys.
 * Existing track objects and their order are retained. When nothing is excluded
 * the original array identity is returned to preserve old memoization behavior. */
export function layerTimelineTracks(layer: Layer, tracks: readonly Track[]): readonly Track[] {
  if (!layerRegistry.findForLayer(layer)?.timelineExcludedPaths?.length) return tracks
  const visible = tracks.filter(track => isLayerTimelineProperty(layer, track.target.slice(`layers.${layer.id}.`.length)))
  return visible.length === tracks.length ? tracks : visible
}

/** Whole-timeline view for selection and minimaps. Owns only a temporary index;
 * source/undo/evaluation keep the original complete timeline. Returns the input
 * identity when all targets are in scope, otherwise a new ordered shallow list. */
export function timelineTracksInScope(layers: readonly Layer[], tracks: Track[]): Track[] {
  const index = new LayerIndex(layers)
  const visible = tracks.filter(track => isTimelineTargetInScope(layers, track.target, index))
  return visible.length === tracks.length ? tracks : visible
}

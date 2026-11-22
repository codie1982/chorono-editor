import type { ChronoScene, Layer, Track } from '../../types'
import { isModifierControlledPath } from '../../modifiers/sourcePolicy'
import { LayerIndex, type LayerLookup } from '../../scene/LayerIndex'
import { layerRegistry } from '../../registry'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'
import { parseTrackTarget } from '../TrackTargetParser'
import { assertTimelineContext, SCENE_TIMELINE_CONTEXT, type TimelineAuthoringContext } from './TimelineAuthoringContext'

/** Whether a layer-relative channel belongs to the active authoring host.
 * Scene context preserves existing subtree exclusions/custom-channel behavior.
 * Content context permits only the exact owner's declared internal leaves; a
 * parent-object write never grants access to asset/structural siblings. This
 * query does not validate Timeline identity or mutate source/runtime state.
 */
export function isLayerTimelineProperty(layer: Layer, path: string, context: TimelineAuthoringContext = SCENE_TIMELINE_CONTEXT): boolean {
  if (propertyPathsOverlap('modifierStack', path) || propertyPathsOverlap('geometryConversion', path) || layer.modifierStack && isModifierControlledPath(path)) return false
  const definition = layerRegistry.findForLayer(layer), excluded = definition?.timelineExcludedPaths
  if (context.kind === 'content') return layer.id === context.ownerLayerId
    && !!(definition?.getContentTimelinePaths?.(layer) ?? definition?.contentTimelinePaths)?.includes(path)
    && !!excluded?.some(root => propertyPathsOverlap(root, path))
  if (context.kind !== 'scene') return false
  if (layer.booleanResultFor && propertyPathsOverlap('spline', path)) return false
  return !excluded?.some(root => propertyPathsOverlap(root, path))
}

/** Resolve a target against borrowed source and an optional snapshot-matched
 * index. Scene callers retain legacy unknown namespace/owner behavior. Content
 * callers reject unknown namespaces, absent owners and foreign layer IDs.
 * Read projection only; commands additionally validate the Timeline binding.
 */
export function isTimelineTargetInScope(layers: readonly Layer[], target: string, lookup?: LayerLookup,
  context: TimelineAuthoringContext = SCENE_TIMELINE_CONTEXT): boolean {
  const parsed = parseTrackTarget(target)
  if (parsed?.entityType !== 'layer') return context.kind === 'scene'
  const layer = lookup ? lookup.get(parsed.entityId) : layers.find(item => item.id === parsed.entityId)
  return layer ? isLayerTimelineProperty(layer, parsed.propertyPath, context) : context.kind === 'scene'
}

/** Reject a target outside the active scope before source publication. Existing
 * callers default to the scene scope. Commands use assertTimelineEditTarget
 * for the Timeline binding as well. Save/open, evaluation, clone and inverse
 * snapshot restoration do not use this guard; legacy keys remain intact.
 */
export function assertTimelineTargetInScope(layers: readonly Layer[], target: string, lookup?: LayerLookup,
  context: TimelineAuthoringContext = SCENE_TIMELINE_CONTEXT): void {
  if (!isTimelineTargetInScope(layers, target, lookup, context)) throw new Error(context.kind === 'scene'
    ? 'Internal content properties cannot be edited on the 2D Timeline. Use the owning content editor; inner clip authoring is not available yet.'
    : 'This key target is outside the content Timeline owner or its supported internal channels.')
}

/** Shared command boundary: validate the active Timeline as well as its target
 * against the current immutable draft. Content callers cannot edit a sibling
 * Timeline or a missing owner by supplying only a matching property path.
 */
export function assertTimelineEditTarget(scene: ChronoScene, timelineId: string, target: string,
  context: TimelineAuthoringContext = SCENE_TIMELINE_CONTEXT, lookup?: LayerLookup): void {
  const parsed = parseTrackTarget(target)
  if (parsed?.entityType === 'layer' && scene.layers.some(layer => layer.booleanOperation?.inputs.some(input => input.layerId === parsed.entityId))) throw new Error('Boolean inputs are static protected sources. Animate the operation group or result transform instead.')
  assertTimelineContext(scene, timelineId, context, lookup)
  assertTimelineTargetInScope(scene.layers, target, lookup, context)
}

/** Borrow a scope-filtered track list for one known layer; never drop persisted keys.
 * Existing track objects and their order are retained. When nothing is excluded
 * the original array identity is returned to preserve old memoization behavior. */
export function layerTimelineTracks(layer: Layer, tracks: readonly Track[],
  context: TimelineAuthoringContext = SCENE_TIMELINE_CONTEXT): readonly Track[] {
  if (context.kind === 'scene' && !layer.modifierStack && !layerRegistry.findForLayer(layer)?.timelineExcludedPaths?.length) return tracks
  const prefix = `layers.${layer.id}.`
  const visible = tracks.filter(track => track.target.startsWith(prefix) && isLayerTimelineProperty(layer, track.target.slice(prefix.length), context))
  return visible.length === tracks.length ? tracks : visible
}

/** Scope-filtered Timeline view for selection/minimaps. Owns only a temporary index;
 * source/undo/evaluation keep the original complete timeline. Optional layerScope
 * is a hard display/selection boundary, excluding global and outside targets;
 * it does not change source command permissions. Returns the input
 * identity when all targets are in scope, otherwise a new ordered shallow list. */
export function timelineTracksInScope(layers: readonly Layer[], tracks: Track[],
  context: TimelineAuthoringContext = SCENE_TIMELINE_CONTEXT, layerScope?: ReadonlySet<string> | null): Track[] {
  const index = new LayerIndex(layers)
  const visible = tracks.filter(track => {
    const owner = layerScope ? parseTrackTarget(track.target) : null
    return (!layerScope || owner?.entityType === 'layer' && layerScope.has(owner.entityId))
      && isTimelineTargetInScope(layers, track.target, index, context)
  })
  return visible.length === tracks.length ? tracks : visible
}

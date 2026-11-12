import type { ChronoScene, Layer, Track } from '@/lib/types'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { projectTrajectoryPosition, trajectoryPositionFromWorld } from './frame'
import type { TrajectoryCapability, TrajectoryDiagnostic, TrajectoryPreparation } from './types'

/** Does a track replace/remap scalar source keys rather than merely interpolate
 * them? This is a conservative source-edit policy, independent of rendering. */
function driven(track: Track): boolean {
  return !!((track.controller && track.controller.type !== 'keyframe') || track.easeCurve || track.timeWarp
    || track.multiplierCurve || track.modifiers?.some(modifier => modifier.enabled)
    || track.keyframes.some(key => key.segmentModifiers?.some(modifier => modifier.enabled)))
}

/** Validate one channel in linear time; dense imported keys must not trigger
 * pairwise collision searches during every overlay rebuild. */
function invalidKeys(track: Track, durationMs: number): boolean {
  const seen = new Set<number>()
  for (const key of track.keyframes) {
    if (typeof key.value !== 'number' || !Number.isFinite(key.value) || !Number.isFinite(key.timeMs)
        || key.timeMs < 0 || key.timeMs > durationMs || seen.has(key.timeMs)) return true
    seen.add(key.timeMs)
  }
  return false
}

/** Prepare explicit authoring ownership without choosing a browser-selected or
 * first timeline implicitly. Missing/cyclic/deep hierarchy returns no context;
 * source drivers/locks remain inspectable read-only contexts. Ordinary parent
 * keys on any timeline are supported through the shared frame evaluator.
 * Returned records/index borrow this exact immutable scene snapshot. */
export function prepareTrajectoryContext(scene: ChronoScene, timelineId: string, layerId: string): TrajectoryPreparation {
  const timeline = scene.timelines.find(item => item.id === timelineId)
  if (!timeline) return { ok: false, diagnostics: [{ code: 'missing-timeline', message: 'Choose an existing timeline for motion editing.', timelineId }] }
  const index = new LayerIndex(scene.layers), layer = index.get(layerId)
  if (!layer) return { ok: false, diagnostics: [{ code: 'missing-layer', message: 'Choose an existing layer for motion editing.', layerId }] }
  const ancestors: Layer[] = [], seen = new Set([layer.id])
  let parentId = layer.parentId
  while (parentId) {
    const parent = index.get(parentId)
    if (!parent || seen.has(parentId) || ancestors.length >= 64) return { ok: false, diagnostics: [{ code: 'invalid-hierarchy', message: 'Repair the missing, cyclic or excessively deep parent hierarchy before motion editing.', layerId }] }
    seen.add(parentId); ancestors.push(parent); parentId = parent.parentId
  }
  const xTarget = `layers.${layer.id}.transform.x`, yTarget = `layers.${layer.id}.transform.y`
  const xTrack = timeline.tracks.find(track => track.target === xTarget), yTrack = timeline.tracks.find(track => track.target === yTarget)
  const diagnostics: TrajectoryDiagnostic[] = []
  const capability: TrajectoryCapability = { editable: true, previewable: true,
    kind: layer.followPath ? 'followPath' : layer.motionPath ? 'inlineMotionPath'
      : [xTrack, yTrack].some(track => track?.controller && track.controller.type !== 'keyframe') ? 'procedural'
        : [xTrack, yTrack].some(track => track?.keyframes.length) ? 'position' : 'none', diagnostics }
  const add = (diagnostic: TrajectoryDiagnostic) => { diagnostics.push(diagnostic); capability.editable = false }
  if (!Number.isFinite(timeline.durationMs) || timeline.durationMs <= 0) add({ code: 'invalid-time', message: 'The motion timeline needs a positive finite duration.', timelineId })
  for (const item of [layer, ...ancestors]) {
    if (item.locked) add({ code: 'locked', message: `Unlock '${item.name}' before editing motion keys.`, layerId: item.id })
    if (item.frozen) add({ code: 'frozen', message: `Unfreeze '${item.name}' before editing motion keys.`, layerId: item.id })
    if (item.followPath) add({ code: 'follow-path', message: item.id === layer.id ? 'Edit the Follow Path source geometry or progress timing; x/y keys do not own this motion.' : 'Convert or bake the parent Follow Path motion before editing dependent position keys.', layerId: item.id })
    if (item.motionPath) add({ code: 'inline-motion-path', message: 'Edit or explicitly convert the inline SVG motion source; position keys cannot replace its output.', layerId: item.id })
    const isTransform = (path?: string) => path?.startsWith('transform.') || path?.startsWith('followPath.') || path === 'motionPath.offset'
    if (Object.keys(item.paramBindings ?? {}).some(isTransform)
        || Object.keys(item.propertyExpressions?.fields ?? {}).some(isTransform)
        || scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === item.id && isTransform(binding.target.property))
        || scene.parameterWires?.some(wire => wire.enabled && wire.target.layerId === item.id && isTransform(wire.target.propertyPath))) {
      add({ code: 'driven-transform', message: 'Bake or remove the transform binding before editing its source position keys.', layerId: item.id })
      capability.previewable = false
    }
    for (const tl of scene.timelines) for (const track of tl.tracks) {
      if (track.target.startsWith(`layers.${item.id}.transform.`) && driven(track)) add({ code: 'driven-transform', message: 'Bake procedural controllers, modifiers or time remapping before editing this motion.', layerId: item.id, timelineId: tl.id })
    }
  }
  for (const tl of scene.timelines) if (tl.id !== timeline.id && tl.tracks.some(track =>
    (track.target === xTarget || track.target === yTarget) && (track.keyframes.length || (track.controller && track.controller.type !== 'keyframe')))) {
    add({ code: 'competing-timeline', message: 'Another timeline also owns this layer’s position. Isolate or resolve that source before editing.', layerId, timelineId: tl.id })
    capability.previewable = false
  }
  for (const target of [xTarget, yTarget]) {
    const tracks = timeline.tracks.filter(track => track.target === target)
    if (tracks.length > 1 || tracks.some(track => invalidKeys(track, timeline.durationMs))) {
      add({ code: 'invalid-keys', message: 'Position keys need unique exact times and finite numeric values inside the timeline.', layerId, timelineId })
    }
  }
  const context = { scene, timeline, layer, index, ancestors, xTarget, yTarget, xTrack, yTrack, capability }
  if (capability.editable) {
    const start = projectTrajectoryPosition(context, 0)
    if (!start || !trajectoryPositionFromWorld(context, 0, start.world)) add({ code: 'singular-parent', message: 'The parent transform is singular at this authoring time.', layerId })
  }
  return { ok: true, context }
}

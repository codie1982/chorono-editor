import type { ChronoScene, Layer } from '../../types'
import { resolveInstanceLayer } from '../../clone/InstanceResolver'
import { parseTrackTarget } from '../../timeline/TrackTargetParser'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'

/** Declared source channel union across all alternative clips, not only the
 * playing one. Stopping a clip does not silently release its owned channels. */
export function modelOwnedChannels(layer: Layer): Set<string> {
  return new Set((layer.model3d?.version ?? 0) >= 2 ? layer.model3d?.animation?.clips.flatMap(clip => clip.tracks.map(track => parseTrackTarget(track.target)!.propertyPath)) : [])
}

/** Explain an externally edited source field's private clip ownership. */
export function modelClipReadOnlyReason(layer: Layer, path: string): string | null {
  const p = Object.values(layer.model3d?.content?.parameters ?? {}).find(p => propertyPathsOverlap(path, p.target))
  if (p) return `Driven by exposed input: ${p.name}.`
  if (layer.model3d?.content?.turntable.enabled && propertyPathsOverlap(path, 'model3d.rotation.y')) return 'Driven by the content turntable.'
  return Array.from(modelOwnedChannels(layer)).some(owned => propertyPathsOverlap(path, owned))
    ? 'This channel belongs to a content clip. Edit it in Edit content.' : null
}

/** General layer patches cannot replace private clips or change their base
 * channel values. Only the detail host supplies its explicit owner identity for
 * an atomic Apply. Inverse history restoration deliberately bypasses this guard.
 * This is internal command authority, not a serialized actor/permission flag.
 */
export function assertModelContentPatch(before: Layer, after: Layer, contentOwnerId?: string): void {
  if (before.type !== 'model3d' || contentOwnerId === before.id && after.id === before.id) return
  if (((before.model3d?.version ?? 0) >= 2 || (after.model3d?.version ?? 0) >= 2)
    && (before.model3d?.version !== after.model3d?.version || JSON.stringify(before.model3d?.animation) !== JSON.stringify(after.model3d?.animation))) {
    throw new Error('Private clips can only be changed in their owning content editor. Existing animation was preserved.')
  }
  if (JSON.stringify(before.model3d?.content) !== JSON.stringify(after.model3d?.content)) {
    // Exposed input values are the sole main-scene editable content leaves.
    const normalized = after.model3d?.content && structuredClone(after.model3d.content)
    if (normalized) for (const [id, p] of Object.entries(normalized.parameters)) {
      const old = before.model3d?.content?.parameters[id]; if (old) p.value = old.value
    }
    if (JSON.stringify(normalized) !== JSON.stringify(before.model3d?.content)) throw new Error('3D structure can only be changed in its owning content editor.')
  }
  if (JSON.stringify(before.model3d?.modeling) !== JSON.stringify(after.model3d?.modeling)) throw new Error('3D modeling can only be changed in its owning content editor.')
  for (const path of Array.from(modelOwnedChannels(before))) if (readPropertyPath(before, path) !== readPropertyPath(after, path)) {
    throw new Error(modelClipReadOnlyReason(before, path)!)
  }
}

const ownershipChecks = new WeakMap<ChronoScene, WeakSet<Layer>>()

/** Reject external animation/drivers which would compete with private authored
 * channels. Existing v1 source is unaffected; no legacy track is removed or
 * migrated. All stored clips reserve their channels, not only the active clip.
 */
export function assertModelClipOwnership(scene: ChronoScene, layer: Layer): void {
  if (layer.type !== 'model3d') return
  const checked = ownershipChecks.get(scene)
  if (checked?.has(layer)) return
  if (layer.instanceOf && !layer.model3d) {
    const effective = resolveInstanceLayer(layer, scene.layers)
    if (effective?.model3d) assertModelClipOwnership(scene, effective)
    return
  }
  const animation = (layer.model3d?.version ?? 0) >= 2 ? layer.model3d?.animation : undefined
  const content = layer.model3d?.content
  if (!animation && !content) return
  const own = modelOwnedChannels(layer)
  for (const p of Object.values(content?.parameters ?? {})) if (Array.from(own).some(path => propertyPathsOverlap(path, p.target))) throw new Error('An exposed 3D parameter conflicts with an authored content channel.')
  if (content?.turntable.enabled && own.has('model3d.rotation.y')) throw new Error('Turntable and authored Y rotation cannot own the same channel.')
  const paths = modelOwnedChannels(layer)
  for (const p of Object.values(content?.parameters ?? {})) paths.add(p.target)
  if (content?.turntable.enabled) paths.add('model3d.rotation.y')
  const overlap = (path?: string) => !!path && Array.from(paths).some(owned => propertyPathsOverlap(path, owned))
  for (const timeline of scene.timelines ?? []) for (const track of timeline.tracks) {
    const target = parseTrackTarget(track.target)
    if (target?.entityType === 'layer' && target.entityId === layer.id && overlap(target.propertyPath)) throw new Error('A main Timeline already owns an internal model clip channel. Existing animation was preserved.')
  }
  if (Object.keys(layer.propertyExpressions?.fields ?? {}).some(overlap) || Object.keys(layer.paramBindings ?? {}).some(overlap)
    || scene.bindings?.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === layer.id && overlap(binding.target.property))
    || scene.parameterWires?.some(wire => wire.enabled && wire.target.layerId === layer.id && overlap(wire.target.propertyPath))) {
    throw new Error('An external driver already owns an internal model clip channel. Existing driver was preserved.')
  }
  const validated = checked ?? new WeakSet<Layer>(); validated.add(layer); ownershipChecks.set(scene, validated)
}

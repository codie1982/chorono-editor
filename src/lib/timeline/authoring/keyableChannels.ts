import type { AnimatableValue, ChronoScene, Layer, Track } from '../../types'
import { ANIMATABLE_PROPERTIES, isPropertyAnimatableOn } from '../../types'
import { layerRegistry } from '../../registry'
import type { PropertySchema } from '../../registry/PropertySchema'
import { assertTrackValues, isVec2, isColorValue, parseAnimatableColor } from '../../animation/typedValues'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'

export type KeysetMode = 'all' | 'transform' | 'animated' | 'selected'
export interface KeyableChannel { path: string; value: AnimatableValue; track?: Track }
const structural = /(?:^|\.)(?:id|parentId|assetId|sourceLayerId|pathLayerId|maskLayerId|instanceOf)(?:\.|$)/

/** Typed scalar/vector/color leaves only. Objects containing topology, arrays,
 * assets and absent optional payloads never turn into guessed numeric zeroes. */
function supported(value: unknown): value is AnimatableValue {
  return typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' || typeof value === 'boolean'
    || isVec2(value) && Object.keys(value).length === 2 || isColorValue(value) && Object.keys(value).length === 4
}

/** Enumerate existing source channels from the registered property schema and
 * legacy animatable catalogue. Explicit existing tracks remain authorable for
 * typed custom channels; structural identity paths are always excluded. The
 * chosen keyset narrows this same universe. No default payload is materialized.
 * Schema animationValueType can declare Vec2/color independently of input type.
 */
export function keyableChannels(layer: Layer, tracks: readonly Track[], mode: KeysetMode, selectedTargets: ReadonlySet<string>): KeyableChannel[] {
  const prefix = `layers.${layer.id}.`, metadata = new Map<string, PropertySchema>()
  const definition = layerRegistry.findForLayer(layer) ?? layerRegistry.get(layer.type)
  for (const group of definition?.getPropertyGroups(layer) ?? []) {
    if (group.showWhen && !group.showWhen(layer)) continue
    for (const schema of group.schemas) if (!schema.showWhen || schema.showWhen(layer)) metadata.set(schema.path, schema)
  }
  const paths = new Set<string>(Array.from(metadata.values()).filter(schema => schema.animatable).map(schema => schema.path))
  for (const property of ANIMATABLE_PROPERTIES) if (isPropertyAnimatableOn(property, layer.type) && !metadata.has(property.path)) paths.add(property.path)
  for (const track of tracks) paths.add(track.target.slice(prefix.length))
  const byPath = new Map(tracks.map(track => [track.target.slice(prefix.length), track]))
  const result: KeyableChannel[] = []
  for (const path of Array.from(paths)) {
    const track = byPath.get(path), schema = metadata.get(path)
    if (structural.test(path) || mode === 'transform' && !path.startsWith('transform.') && path !== 'opacity'
      || mode === 'animated' && !track || mode === 'selected' && !selectedTargets.has(prefix + path)) continue
    const value = readPropertyPath(layer, path)
    const sample = value === undefined ? track?.keyframes[0]?.value : value
    if (!supported(sample)) continue
    const family = schema?.animationValueType ?? schema?.valueType
    if (family === 'color' && !parseAnimatableColor(sample) || family === 'vec2' && !isVec2(sample)
      || family === 'boolean' && typeof sample !== 'boolean' || family === 'string' && typeof sample !== 'string'
      || ['number', 'angle', 'percent'].includes(family ?? '') && typeof sample !== 'number') continue
    try { assertTrackValues({ target: prefix + path, keyframes: [{ id: 'validation', timeMs: 0, value: sample, easing: { type: 'linear' } }] }, sample) }
    catch { continue }
    result.push({ path, value: sample, track })
  }
  return result
}

/** Report driven inputs rather than writing an evaluated effect back to source.
 * A supported explicit Bake/Convert stays a separate user operation. */
export function drivenChannelReason(scene: ChronoScene, layer: Layer, path: string, track?: Track): string | null {
  if (track?.controller && track.controller.type !== 'keyframe') return 'Procedural controller: bake or convert it first.'
  if (track?.easeCurve || track?.timeWarp || track?.multiplierCurve || track?.modifiers?.some(item => item.enabled)
    || track?.keyframes.some(key => key.segmentModifiers?.some(item => item.enabled))) return 'Modifiers/time remapping: bake this channel first.'
  if (Object.keys(layer.paramBindings ?? {}).some(input => input === path)
    || scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === layer.id && binding.target.property === path)
    || scene.parameterWires?.some(wire => wire.enabled && wire.target.layerId === layer.id && wire.target.propertyPath === path)) return 'A binding or wire drives this input.'
  if (layer.followPath && ['transform.x', 'transform.y', ...(layer.followPath.orientToPath ? ['transform.rotationDeg'] : [])].includes(path)
    || layer.motionPath && ['transform.x', 'transform.y', 'transform.rotationDeg'].includes(path)) return 'Path-driven transform: key the path controls or bake first.'
  return null
}

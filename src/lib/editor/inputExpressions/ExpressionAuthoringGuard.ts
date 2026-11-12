import type { ChronoScene, Layer } from '../../types'
import { propertyExpressionConstraints, type ScalarExpressionType } from '../../expression/properties/PropertyExpressionCapability'
import { drivenChannelReason } from '../../timeline/authoring/keyableChannels'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'

/** One editor ownership guard, independent of evaluator playback locks. Source
 * instances must be detached/edited at their definition; caller owns source CAS. */
export function assertExpressionTarget(layer: Layer, path: string, kind: ScalarExpressionType, mode: 'constant' | 'live' = 'constant') {
  if (layer.locked || layer.frozen) throw new Error('Unlock this layer before editing its formula.')
  if (layer.instanceOf) throw new Error('Edit the instance source or detach this instance first.')
  return propertyExpressionConstraints(layer, path, kind, mode)
}
/** Native parent/child channel ownership, including currently muted timelines.
 * Geometry/config inputs without an Auto Key adapter use this same guard. */
export function hasNativeExpressionOwner(scene: ChronoScene, layerId: string, path: string): boolean {
  const target = 'layers.' + layerId + '.' + path
  return scene.timelines.some(timeline => timeline.tracks.some(track => propertyPathsOverlap(track.target, target) && !!(track.keyframes.length || track.controller)))
}
/** Report existing animation/binding/path ownership instead of silently replacing
 * it with a constant expression. All timelines are considered, including muted
 * or currently inactive ones. A1 does not remove or bake existing drivers. */
export function inputExpressionBlock(scene: ChronoScene, layer: Layer, path: string, ignorePropertyExpression = false, resultType: ScalarExpressionType = 'number', mode: 'constant' | 'live' = 'constant'): string | null {
  try {
    assertExpressionTarget(layer, path, resultType, mode)
  } catch (error) { return (error as Error).message }
  if (hasNativeExpressionOwner(scene, layer.id, path)) return 'This channel is animated. Keep its keys; use a different field or an explicit bake workflow.'
  if (Object.keys(layer.propertyExpressions?.fields ?? {}).some(other => propertyPathsOverlap(other, path) && (!ignorePropertyExpression || other !== path))) return 'An overlapping live expression owns this channel.'
  return drivenChannelReason(scene, layer, path, undefined, { ignorePropertyExpression })
}

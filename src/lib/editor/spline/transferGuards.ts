import { assertLayerUnreferenced } from '../../scene/references/assertLayerUnreferenced'
import type { ChronoScene, Layer } from '../../types'
import { hasNativeExpressionOwner } from '../inputExpressions/ExpressionAuthoringGuard'
import { drivenChannelReason } from '../../timeline/authoring/keyableChannels'
import { editableSplineLayer } from '../../spline/edit/authoringGuard'

/** Geometry Attach consumes a layer, so live readers of that layer cannot be
 * silently retargeted to one SubShape. Names/provenance are excluded; all other
 * typed or plugin semantic payloads are conservatively searched for ID tokens.
 * Timeline membership alone is removed by the existing delete-layer command. */
export function assertAttachSourceUnreferenced(scene: ChronoScene, sourceId: string): void {
  assertLayerUnreferenced(scene, sourceId, 'Another layer, animation or scene reference uses this Attach source. Keep it separate or explicitly convert those references first.')
}

/** Attach changes coordinate ownership. Only static transform chains are
 * converted; even muted animation, expressions, paths and binding writers reject
 * instead of flattening one evaluated pose. Common animated parents are also
 * conservatively refused in this initial transfer contract. */
export function assertStaticSplineTransformChain(scene: ChronoScene, layer: Layer): void {
  editableSplineLayer(scene, layer.id)
  let current: Layer | undefined = layer
  while (current) {
    if (hasNativeExpressionOwner(scene, current.id, 'transform') || drivenChannelReason(scene, current, 'transform') || current.motionPath || current.followPath)
      throw new Error('Attach requires static transform chains. Keep outer animation or explicitly bake before changing coordinate ownership.')
    current = current.parentId ? scene.layers.find(item => item.id === current!.parentId) : undefined
  }
}

/** Presentation inherited only from a source-exclusive ancestor would disappear
 * on reparenting into the target. Shared ancestors keep their existing role;
 * unshared opacity/effects/masks/live opacity require an explicit bake instead. */
export function assertAttachAncestorPresentation(scene: ChronoScene, source: Layer, target: Layer): void {
  const targetAncestors = new Set<string>()
  let item: Layer | undefined = target
  while (item) { targetAncestors.add(item.id); item = scene.layers.find(layer => layer.id === item!.parentId) }
  item = scene.layers.find(layer => layer.id === source.parentId)
  while (item && !targetAncestors.has(item.id)) {
    if ((item.startMs ?? 0) !== 0 || (item.endMs ?? scene.composition.durationMs) !== scene.composition.durationMs || item.opacity !== 1 || item.blendMode && item.blendMode !== 'source-over' || Object.keys(item.effects ?? {}).length || item.effectsChain?.length || item.masks?.length
      || hasNativeExpressionOwner(scene, item.id, 'opacity') || drivenChannelReason(scene, item, 'opacity'))
      throw new Error('The source parent supplies timing/opacity/effects/masks. Keep that presentation separate or explicitly bake it before Attach.')
    item = scene.layers.find(layer => layer.id === item!.parentId)
  }
}

import type { ChronoScene, Layer } from '../types'

/** Static stack/source and its generated geometry are not independent timeline
 * channels. Transform, paint and existing clip-time playback retain ownership.
 * Future animated modifier settings need an explicit time/evaluation contract. */
export function isModifierControlledPath(path: string): boolean {
  return /^(?:modifierStack|geometryConversion|spline|size|shapeParams|shapeKind|shape|mesh2d\.(?:geometry|source|deformation)|style\.cornerRadius)(?:\.|$)/.test(path)
}

/** Read-only admission shared by commands and portable source validation.
 * A static source may not silently capture one pose of an active geometry driver. */
export function modifierGeometryDriverReason(scene: ChronoScene, layer: Layer): string | null {
  const prefix = `layers.${layer.id}.`
  if (scene.timelines?.some(timeline => timeline.tracks.some(track => track.target.startsWith(prefix) && isModifierControlledPath(track.target.slice(prefix.length))))
    || Object.keys(layer.propertyExpressions?.fields ?? {}).some(isModifierControlledPath)
    || Object.keys(layer.paramBindings ?? {}).some(isModifierControlledPath)
    || scene.parameterWires?.some(wire => wire.enabled && wire.target.layerId === layer.id && isModifierControlledPath(wire.target.propertyPath ?? ''))
    || scene.bindings?.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === layer.id && isModifierControlledPath(binding.target.property ?? '')))
    return 'Bake or remove geometry animation or live drivers before changing this static modifier stack. Transform and paint animation can remain.'
  return null
}

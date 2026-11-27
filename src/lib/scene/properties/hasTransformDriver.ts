import type { ChronoScene, Layer } from '../../types'

/** Identify target-owned drivers whose rendered output cannot safely become a
 * new TRS input. Animated parents remain valid: only the edited root is tested. An explicit list limits checks to the written channels. */
export function hasTransformDriver(scene: ChronoScene, layer: Layer, properties?: readonly string[]): boolean {
  const transformPath = (path: string | undefined) => path !== undefined && (properties ? properties.includes(path) : path.startsWith('transform.'))
  const prefix = `layers.${layer.id}.`
  return !!(layer.followPath || layer.motionPath
    || Object.keys(layer.propertyExpressions?.fields ?? {}).some(transformPath)
    || Object.keys(layer.paramBindings ?? {}).some(transformPath)
    || scene.bindings.some(binding => binding.target.type === 'layerProperty'
      && binding.target.layerId === layer.id && transformPath(binding.target.property))
    || scene.parameterWires?.some(wire => wire.enabled && wire.target.layerId === layer.id
      && transformPath(wire.target.propertyPath))
    || scene.timelines.some(timeline => timeline.tracks.some(track =>
      track.target.startsWith(prefix) && transformPath(track.target.slice(prefix.length)) && (
        (track.controller && track.controller.type !== 'keyframe') || track.easeCurve || track.timeWarp
        || track.multiplierCurve || track.modifiers?.some(modifier => modifier.enabled)
        || track.keyframes.some(key => key.segmentModifiers?.some(modifier => modifier.enabled))
      ))))
}

import type { ChronoScene, Layer } from '../../types'
/** Detect authored camera drivers before a direct source gesture/reset. Existing
 * keys (including zero-key controllers), bindings, expressions and enabled wires
 * remain authoritative; direct controls never erase or fight their output. */
export function cameraIsDriven(scene: ChronoScene, layer: Layer): boolean {
  const cameraPath = (path?: string) => !!path && path.startsWith('model3d.camera')
  return Object.values(layer.model3d?.content?.parameters ?? {}).some(p => cameraPath(p.target))
    || !!((layer.model3d?.version ?? 0) >= 2 && layer.model3d?.animation?.clips.some(clip => clip.tracks.some(track => track.target.startsWith('layers.content.model3d.camera'))))
    || scene.timelines.some(timeline => timeline.tracks.some(track => track.target.startsWith(`layers.${layer.id}.model3d.camera`)))
    || Object.keys(layer.paramBindings ?? {}).some(cameraPath)
    || Object.keys(layer.propertyExpressions?.fields ?? {}).some(cameraPath)
    || scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === layer.id && cameraPath(binding.target.property))
    || !!scene.parameterWires?.some(wire => wire.enabled && wire.target.layerId === layer.id && cameraPath(wire.target.propertyPath))
}

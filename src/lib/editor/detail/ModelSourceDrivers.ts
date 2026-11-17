import type { ChronoScene, Layer } from '../../types'
import { parseTrackTarget } from '../../timeline/TrackTargetParser'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
/** Preserve existing external driver fallback fields while allowing unrelated
 * internal content edits. Whole-model guards would wrongly block every node
 * whenever one exposed input is wired. No driver is removed, baked or copied. */
export function assertModelSourceDrivers(scene: ChronoScene, before: Layer, after: Layer): void {
  const paths = new Set<string>([...Object.keys(before.propertyExpressions?.fields ?? {}), ...Object.keys(before.paramBindings ?? {})])
  for (const timeline of scene.timelines) for (const track of timeline.tracks) {
    const target = parseTrackTarget(track.target)
    if (target?.entityType === 'layer' && target.entityId === before.id) paths.add(target.propertyPath)
  }
  for (const wire of scene.parameterWires ?? []) if (wire.enabled && wire.target.layerId === before.id) paths.add(wire.target.propertyPath)
  for (const binding of scene.bindings ?? []) if (binding.target.type === 'layerProperty' && binding.target.layerId === before.id) binding.target.property && paths.add(binding.target.property)
  for (const path of Array.from(paths)) if (path.startsWith('model3d.') && JSON.stringify(readPropertyPath(before, path)) !== JSON.stringify(readPropertyPath(after, path))) {
    throw new Error('An existing driver owns this 3D input. Preserve it or explicitly change the driver first.')
  }
}

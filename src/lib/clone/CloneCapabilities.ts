import type { ChronoScene, Layer } from '../types'
import type { CloneMode } from './CloneTypes'
import { resolveInstanceLayer } from './InstanceResolver'
import { remapCloneLayerReferences } from './CloneReferenceRemapper'

/** Preflight visual source/link capability without allocating clone IDs or
 * payloads. Thin instances cannot override inherited internal references;
 * independent Copy can materialize them. Dummy map values are transient and
 * never serialized. Parent references are structural, not inherited appearance.
 */
export function assertCloneModeCapability(scene: ChronoScene, sources: readonly Layer[], mode: CloneMode = 'copy'): void {
  if (mode !== 'copy' && mode !== 'instance') throw new Error('Use independent Copy or supported linked Instance.')
  const ids = new Set(sources.map(layer => layer.id))
  for (const owner of scene.layers) if (owner.booleanOperation) {
    const members = [owner.id, owner.booleanOperation.resultLayerId, ...owner.booleanOperation.inputs.map(input => input.layerId)]
    if (members.some(id => ids.has(id)) && members.some(id => !ids.has(id))) throw new Error('Copy the complete Boolean operation group, including its sources and result.')
  }
  const probe = Object.fromEntries(sources.map(source => [source.id, `${source.id}\0clone-capability`]))
  for (const source of sources) {
    const resolved = resolveInstanceLayer(source, scene.layers)
    if (!resolved) throw new Error('The instance source is missing, cyclic or exceeds the supported chain depth.')
    if (mode !== 'instance') continue
    if (resolved.booleanOperation || resolved.booleanResultFor || scene.layers.some(layer => layer.booleanOperation?.inputs.some(input => input.layerId === resolved.id)))
      throw new Error('Boolean operation forests require independent Copy; linked Instance cannot retarget protected inputs/results.')
    const withoutParent = { ...resolved, parentId: undefined }
    if (JSON.stringify(remapCloneLayerReferences(withoutParent, probe)) !== JSON.stringify(withoutParent)) {
      throw new Error('Linked instances cannot remap internal mask/path/repeater/particle sources. Use independent Copy for this forest.')
    }
  }
}

import type { ModelSelection } from '../inspection/types'
import type { Model3DData } from '../types'
import { PRIMITIVE_SELECTION_INSTANCE } from '../modeling/poly/primitiveSource'

/** Strip the private owner prefix while retaining the stable 3D property path.
 * Outer 2D tracks never enter a model clip, but this rejects them if passed by
 * an adapter. The result is deterministic across saves and object renames. */
export function modelPathFromTrack(target: string): string | null {
  const match = target.match(/^layers\.[^.]+\.(model3d\..+)$/)
  return match?.[1] ?? null
}

/** Only the selected object's own properties belong to its animation view.
 * Imported node transforms are node owned; shared instance materials and
 * cameras remain separate channels rather than appearing on every node. */
export function modelTrackBelongsToSelection(target: string, selection?: ModelSelection): boolean {
  const path = modelPathFromTrack(target)
  if (!path) return false
  if (!selection) return true
  return path.startsWith(selection.instanceId === PRIMITIVE_SELECTION_INSTANCE
    ? `model3d.modeling.objectsById.${selection.nodeId}.`
    : `model3d.content.instances.${selection.instanceId}.nodes.${selection.nodeId}.`)
}

/** Human name for the active object header; identity still comes from IDs. */
export function modelSelectionName(data: Model3DData | undefined, selection?: ModelSelection): string | null {
  if (!selection) return null
  if (selection.instanceId === PRIMITIVE_SELECTION_INSTANCE)
    return data?.modeling?.objects.find(item => item.id === selection.nodeId)?.name ?? null
  const instance = data?.content?.instances[selection.instanceId]
  const node = instance?.nodes[selection.nodeId]
  return node ? `${instance.name} / ${node.name}` : null
}

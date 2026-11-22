import type { ModelSelection } from './types'
import type { ModelResourceLookup } from './types'
import type { Model3DData, Model3DResource } from '../types'
import { PRIMITIVE_SELECTION_INSTANCE } from '../modeling/poly/primitiveSource'
import { SCENE_OBJECT_SELECTION_INSTANCE } from '../source/modelSceneObjects'

/** Stable view-local key for reusing the 2D selection-set policy. JSON encoding
 * avoids collisions between arbitrary imported instance and node identifiers. */
export function modelSelectionKey(selection: ModelSelection): string {
  return JSON.stringify([selection.instanceId, selection.nodeId])
}

/** Decode only keys created by modelSelectionKey; no source data is changed. */
export function modelSelectionFromKey(key: string): ModelSelection {
  const [instanceId, nodeId] = JSON.parse(key) as [string, string]
  return { instanceId, nodeId }
}

/** Enumerate visible, editable 3D objects for Select All. Imported model nodes
 * and authored primitives share the viewport's selection identity. A hidden or
 * frozen instance excludes its whole subtree; isolation limits the result to
 * the currently inspected keys. No source or decoded inventory is mutated. */
export function selectableModelObjects(data: Model3DData, primary: Model3DResource | undefined, lookup: ModelResourceLookup,
  isolatedKeys?: ReadonlySet<string>): ModelSelection[] {
  const result: ModelSelection[] = []
  const include = (selection: ModelSelection) => { if (!isolatedKeys || isolatedKeys.has(modelSelectionKey(selection))) result.push(selection) }
  const instances = data.content ? Object.entries(data.content.instances) : [['primary', undefined]] as const
  for (const [instanceId, instance] of instances) {
    if (instanceId === 'primary' && primary?.isExplicitEmptyScene || instance?.visible === false || instance?.frozen) continue
    const inventory = (instanceId === 'primary' ? primary : lookup(instance?.assetId ?? ''))?.inventory
    const nodes = new Map(inventory?.nodes.map(node => [node.id, node]) ?? [])
    const available = new Map<string, boolean>(), visiting = new Set<string>()
    const canSelect = (nodeId: string): boolean => {
      const cached = available.get(nodeId)
      if (cached !== undefined) return cached
      if (visiting.has(nodeId)) return false
      const node = nodes.get(nodeId)
      if (!node) return false
      visiting.add(nodeId)
      const pose = instance?.nodes[nodeId]
      const allowed = (pose?.visible ?? node.visible) !== false && !pose?.frozen
        && (!node.parentId || !nodes.has(node.parentId) || canSelect(node.parentId))
      visiting.delete(nodeId); available.set(nodeId, allowed)
      return allowed
    }
    for (const node of inventory?.nodes ?? []) if (canSelect(node.id)) include({ instanceId, nodeId: node.id })
  }
  for (const object of data.modeling?.objects ?? []) if (object.visible !== false && !object.frozen)
    include({ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: object.id })
  for (const object of data.sceneObjects?.objects ?? []) if (object.visible !== false && !object.frozen)
    include({ instanceId: SCENE_OBJECT_SELECTION_INSTANCE, nodeId: object.id })
  return result
}

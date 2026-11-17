import type { Model3DData } from '../types'
import type { ModelInventory } from '../content/types'
import type { ModelTreeVisibility } from '../inspection/modelSceneTree'
import { withModelContent } from '../content/modelContent'
import { updatePrimitive } from '../modeling/poly/primitiveSource'
import { updateSceneObject } from './modelSceneObjects'

/** Rename one authored 3D object without changing its stable ID or imported
 * asset. Imported node names are scene-local overrides of immutable glTF
 * inventory names. The caller validates the returned source before commit;
 * missing targets and blank/oversized names fail without mutation. */
export function renameModelSceneObject(data: Model3DData, target: ModelTreeVisibility,
  name: string, primaryInventory?: ModelInventory): Model3DData {
  const nextName = name.trim()
  if (!nextName || nextName.length > 80) throw new Error('3D object name must contain 1–80 characters.')
  if (target.kind === 'primitive') {
    if (!target.nodeId) throw new Error('Missing 3D primitive ID.')
    return updatePrimitive(data, target.nodeId, object => object.name === nextName ? object : { ...object, name: nextName })
  }
  if (target.kind === 'camera' || target.kind === 'light') {
    if (!target.nodeId) throw new Error('Missing 3D scene object ID.')
    return updateSceneObject(data, target.nodeId, object => ({ ...object, name: nextName }))
  }
  if (!data.content && !primaryInventory) throw new Error('Prepare the 3D model before renaming it.')
  const base = data.content ? data : withModelContent(data, primaryInventory!)
  const instance = base.content?.instances[target.instanceId]
  if (!instance) throw new Error('3D model instance no longer exists.')
  if (target.kind === 'instance') {
    if (instance.name === nextName) return data
    return { ...base, content: { ...base.content!, instances: {
      ...base.content!.instances, [target.instanceId]: { ...instance, name: nextName },
    } } }
  }
  if (!target.nodeId || !instance.nodes[target.nodeId]) throw new Error('3D model node no longer exists.')
  const node = instance.nodes[target.nodeId]
  if (node.name === nextName) return data
  return { ...base, content: { ...base.content!, instances: {
    ...base.content!.instances, [target.instanceId]: { ...instance, nodes: {
      ...instance.nodes, [target.nodeId]: { ...node, name: nextName },
    } },
  } } }
}

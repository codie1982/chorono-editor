import type { Model3DData } from '../types'
import type { ModelInventory } from '../content/types'
import type { ModelTreeVisibility } from '../inspection/modelSceneTree'
import { withModelContent } from '../content/modelContent'
import { updatePrimitive } from '../modeling/poly/primitiveSource'
import { updateSceneObject } from './modelSceneObjects'

/** Set one Explorer object flag without flattening child overrides. Optional
 * flags preserve old scenes as visible, selectable and renderable by default.
 * A legacy static model is promoted only when its first flag edit needs
 * a node/instance record. Input data is never mutated. */
export function setModelTreeFlag(data: Model3DData, target: ModelTreeVisibility,
  flag: 'visible' | 'frozen' | 'renderable', value: boolean, primaryInventory?: ModelInventory): Model3DData {
  if (target.kind === 'primitive') {
    if (!target.nodeId) throw new Error('Missing 3D primitive ID.')
    return updatePrimitive(data, target.nodeId, object => ({ ...object, [flag]: value }))
  }
  if (target.kind === 'camera' || target.kind === 'light') {
    if (!target.nodeId) throw new Error('Missing 3D scene object ID.')
    return updateSceneObject(data, target.nodeId, object => ({ ...object, [flag]: value }))
  }
  if (!data.content && !primaryInventory) throw new Error('Prepare the 3D model before editing visibility.')
  const base = data.content ? data : withModelContent(data, primaryInventory!)
  const instance = base.content?.instances[target.instanceId]
  if (!instance) throw new Error('3D model instance no longer exists.')
  if (target.kind === 'instance') return { ...base, content: { ...base.content!, instances: {
    ...base.content!.instances, [target.instanceId]: { ...instance, [flag]: value },
  } } }
  if (!target.nodeId || !instance.nodes[target.nodeId]) throw new Error('3D model node no longer exists.')
  return { ...base, content: { ...base.content!, instances: {
    ...base.content!.instances, [target.instanceId]: { ...instance, nodes: {
      ...instance.nodes, [target.nodeId]: { ...instance.nodes[target.nodeId], [flag]: value },
    } },
  } } }
}

/** Existing eye command remains the stable caller contract. */
export function setModelTreeVisibility(data: Model3DData, target: ModelTreeVisibility,
  visible: boolean, primaryInventory?: ModelInventory): Model3DData {
  return setModelTreeFlag(data, target, 'visible', visible, primaryInventory)
}

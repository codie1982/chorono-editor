import type { Model3DData } from '../types'
import type { ModelSelection } from '../inspection/types'
import { PRIMITIVE_SELECTION_INSTANCE } from '../modeling/poly/primitiveSource'
import { SCENE_OBJECT_SELECTION_INSTANCE } from './modelSceneObjects'

export interface ModelSceneDeletionTargets {
  readonly primitiveIds: readonly string[]
  readonly instanceIds: readonly string[]
  readonly sceneObjectIds?: readonly string[]
}

/** Map view-local node selections to removable source objects. An imported
 * node belongs to its whole added instance; the primary asset and its nodes
 * remain part of the containing 3D layer and cannot be deleted here. Duplicate
 * node selections in one instance produce one deletion target. */
export function modelSceneDeletionTargets(data: Model3DData, selections: readonly ModelSelection[]): ModelSceneDeletionTargets {
  const primitiveIds = new Set<string>(), instanceIds = new Set<string>(), sceneObjectIds = new Set<string>()
  const primitives = new Set(data.modeling?.objects.map(object => object.id) ?? [])
  for (const selection of selections) {
    if (selection.instanceId === PRIMITIVE_SELECTION_INSTANCE) {
      if (primitives.has(selection.nodeId)) primitiveIds.add(selection.nodeId)
    } else if (selection.instanceId === SCENE_OBJECT_SELECTION_INSTANCE) {
      if (data.sceneObjects?.objects.some(object => object.id === selection.nodeId)) sceneObjectIds.add(selection.nodeId)
    } else if (selection.instanceId !== 'primary' && data.content?.instances[selection.instanceId]?.nodes[selection.nodeId]) {
      instanceIds.add(selection.instanceId)
    }
  }
  return { primitiveIds: Array.from(primitiveIds), instanceIds: Array.from(instanceIds),
    ...(sceneObjectIds.size ? { sceneObjectIds: Array.from(sceneObjectIds) } : {}) }
}

/** Remove several 3D scene objects in one immutable source change. The caller
 * owns the Undo command and prunes private clip tracks for removed instances.
 * Parameter inputs targeting a deleted instance are removed here. Unknown or
 * primary targets fail before any source is changed. */
export function removeModelSceneObjects(data: Model3DData, targets: ModelSceneDeletionTargets): Model3DData {
  const primitiveIds = new Set(targets.primitiveIds), instanceIds = new Set(targets.instanceIds), sceneObjectIds = new Set(targets.sceneObjectIds ?? [])
  if (!primitiveIds.size && !instanceIds.size && !sceneObjectIds.size) return data
  const primitives = new Set(data.modeling?.objects.map(object => object.id) ?? [])
  if (Array.from(primitiveIds).some(id => !primitives.has(id))) throw new Error('A selected 3D primitive no longer exists.')
  if (Array.from(instanceIds).some(id => id === 'primary' || !data.content?.instances[id])) throw new Error('A selected 3D model instance cannot be removed.')
  if (Array.from(sceneObjectIds).some(id => !data.sceneObjects?.objects.some(object => object.id === id))) throw new Error('A selected 3D scene object no longer exists.')
  const base = sceneObjectIds.size ? { ...data, sceneObjects: { ...data.sceneObjects!, objects: data.sceneObjects!.objects.filter(object => !sceneObjectIds.has(object.id)),
    activeCameraId: sceneObjectIds.has(data.sceneObjects!.activeCameraId ?? '')
      ? data.sceneObjects!.objects.find(object => object.kind === 'camera' && !sceneObjectIds.has(object.id))?.id : data.sceneObjects!.activeCameraId } } : data
  const source = primitiveIds.size ? { ...base, modeling: { ...base.modeling!, objects: base.modeling!.objects.filter(object => !primitiveIds.has(object.id)) } } : base
  if (!instanceIds.size) return source
  const content = data.content!
  const instances = Object.fromEntries(Object.entries(content.instances).filter(([id]) => !instanceIds.has(id)))
  const parameters = Object.fromEntries(Object.entries(content.parameters).filter(([, parameter]) =>
    !Array.from(instanceIds).some(id => parameter.target.startsWith(`model3d.content.instances.${id}.`))))
  return { ...source, content: { ...content, instances, parameters } }
}

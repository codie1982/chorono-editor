import type { Model3DData, Model3DResource } from '../types'
import type { ModelContentInstance, ModelInventory, ModelNodeInfo } from '../content/types'
import type { ModelResourceLookup, ModelSelection } from './types'
import { modelSelectionKey } from './modelSelection'
import { PRIMITIVE_SELECTION_INSTANCE } from '../modeling/poly/primitiveSource'
import { SCENE_OBJECT_SELECTION_INSTANCE } from '../source/modelSceneObjects'

export type ModelSceneTreeKind = 'scene' | 'collection' | 'instance' | 'node' | 'primitive' | 'camera' | 'light' | 'geometry' | 'material' | 'placeholder'
export type ModelTreeVisibility = { kind: 'instance' | 'node' | 'primitive' | 'camera' | 'light'; instanceId: string; nodeId?: string; visible: boolean; frozen?: boolean; renderable?: boolean }
export interface ModelSceneTreeItem {
  id: string; name: string; kind: ModelSceneTreeKind
  detail?: string; selection?: ModelSelection; inspect?: 'material'
  visibility?: ModelTreeVisibility; children: ModelSceneTreeItem[]
}

/** Build a view-only hierarchy from every imported instance and authored
 * primitive. Imported parent IDs determine nesting; corrupt/cyclic ancestry is
 * bounded and remaining nodes are still reachable. Collections are generated
 * only for types present in source. Legacy output-camera and lighting settings
 * are not presented as invented rows. */
export function buildModelSceneTree(name: string, data: Model3DData, primary: Model3DResource | undefined,
  lookup: ModelResourceLookup, isolatedKeys?: ReadonlySet<string>): ModelSceneTreeItem {
  const children: ModelSceneTreeItem[] = [], models: ModelSceneTreeItem[] = []
  const instances: [string, ModelContentInstance | undefined][] = data.content
    ? Object.entries(data.content.instances) : [['primary', undefined]]
  for (const [id, instance] of instances) {
    const inventory = (id === 'primary' ? primary : lookup(instance?.assetId ?? ''))?.inventory
    if (id === 'primary' && (primary?.isExplicitEmptyScene || !data.assetId)) continue
    const first = inventory?.nodes[0], selection = first && { instanceId: id, nodeId: first.id }
    models.push({ id: `instance:${id}`, name: instance?.name ?? 'Model', kind: 'instance', selection,
      detail: inventory ? `${inventory.nodes.length} nodes` : 'Preparing 3D model',
      visibility: { kind: 'instance', instanceId: id, visible: instance?.visible !== false, frozen: instance?.frozen === true, renderable: instance?.renderable !== false },
      children: inventory ? importedNodes(id, inventory, instance) : [
        { id: `instance:${id}:loading`, name: 'Preparing model…', kind: 'placeholder', children: [] },
      ] })
  }
  if (models.length) children.push({ id: 'group:models', name: 'Imported models', kind: 'collection', children: models })
  const primitives = new Map<string, ModelSceneTreeItem[]>()
  for (const object of data.modeling?.objects ?? []) {
    const selection = { instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: object.id }
    const group = primitives.get(object.geometry.kind) ?? []
    group.push({ id: `primitive:${object.id}`, name: object.name, kind: 'primitive', selection,
      visibility: { kind: 'primitive', instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: object.id, visible: object.visible !== false,
        frozen: object.frozen === true, renderable: object.renderable !== false },
      children: [
        { id: `primitive:${object.id}:geometry`, name: `${object.geometry.kind} mesh`, kind: 'geometry', selection, children: [] },
        { id: `primitive:${object.id}:material`, name: 'Material', kind: 'material', selection, inspect: 'material', children: [] },
      ] }); primitives.set(object.geometry.kind, group)
  }
  for (const [kind, objects] of Array.from(primitives)) children.push({ id: `group:${kind}`, name: `${kind[0].toUpperCase()}${kind.slice(1)} objects`, kind: 'collection', children: objects })
  for (const kind of ['camera', 'light'] as const) {
    const objects = (data.sceneObjects?.objects ?? []).filter(object => object.kind === kind)
    if (objects.length) children.push({ id: `group:${kind}s`, name: kind === 'camera' ? 'Cameras' : 'Lights', kind: 'collection',
      children: objects.map(object => ({ id: `${kind}:${object.id}`, name: object.name, kind,
        detail: kind === 'camera' && data.sceneObjects?.activeCameraId === object.id ? 'Active render camera'
          : kind === 'light' && object.kind === 'light' ? object.lightType : undefined,
        selection: { instanceId: SCENE_OBJECT_SELECTION_INSTANCE, nodeId: object.id },
        visibility: { kind, instanceId: SCENE_OBJECT_SELECTION_INSTANCE, nodeId: object.id,
          visible: object.visible !== false, frozen: object.frozen === true, renderable: object.renderable !== false }, children: [] })) })
  }
  const root: ModelSceneTreeItem = { id: 'scene', name: 'Scene Collection', kind: 'scene', children: [
    { id: 'collection', name, kind: 'collection', children },
  ] }
  return isolatedKeys ? filterIsolated(root, isolatedKeys) ?? { ...root, children: [] } : root
}

/** A selected object keeps its subtree; otherwise retain only selected
 * descendants and their generated type groups. */
function filterIsolated(item: ModelSceneTreeItem, keys: ReadonlySet<string>, ancestorSelected = false): ModelSceneTreeItem | null {
  const selected = ancestorSelected || item.kind !== 'instance' && !!item.selection && keys.has(modelSelectionKey(item.selection))
  if (selected) return item
  const children = item.children.map(child => filterIsolated(child, keys)).filter((child): child is ModelSceneTreeItem => !!child)
  return children.length || item.kind === 'scene' || item.id === 'collection' ? { ...item, children } : null
}

/** Reduce a large imported inventory to stable parent-child rows without
 * copying geometry. A visited set prevents duplicate/cyclic nodes. */
function importedNodes(instanceId: string, inventory: ModelInventory, instance?: ModelContentInstance): ModelSceneTreeItem[] {
  const byId = new Map(inventory.nodes.map(node => [node.id, node]))
  const children = new Map<string, ModelNodeInfo[]>()
  for (const info of inventory.nodes) if (info.parentId && byId.has(info.parentId)) {
    const list = children.get(info.parentId) ?? []; list.push(info); children.set(info.parentId, list)
  }
  const visited = new Set<string>()
  const build = (info: ModelNodeInfo, depth: number): ModelSceneTreeItem | null => {
    if (visited.has(info.id) || depth > 128) return null
    visited.add(info.id)
    const selection = { instanceId, nodeId: info.id }
    const nested = (children.get(info.id) ?? []).map(child => build(child, depth + 1)).filter((child): child is ModelSceneTreeItem => !!child)
    if (/mesh/i.test(info.kind)) nested.push({ id: `node:${instanceId}:${info.id}:geometry`, name: 'Mesh data', kind: 'geometry', selection,
      children: info.materialIds.map(id => ({ id: `node:${instanceId}:${info.id}:material:${id}`, name: `Material ${id}`, kind: 'material', selection, inspect: 'material', children: [] })) })
    const pose = instance?.nodes[info.id]
    return { id: `node:${instanceId}:${info.id}`, name: pose?.name ?? info.name, kind: 'node', detail: info.kind, selection,
      visibility: { kind: 'node', instanceId, nodeId: info.id, visible: pose?.visible ?? info.visible,
        frozen: pose?.frozen === true, renderable: pose?.renderable !== false }, children: nested }
  }
  const roots = inventory.nodes.filter(info => !info.parentId || !byId.has(info.parentId))
  const result = roots.map(info => build(info, 0)).filter((item): item is ModelSceneTreeItem => !!item)
  for (const info of inventory.nodes) if (!visited.has(info.id)) { const item = build(info, 0); if (item) result.push(item) }
  return result
}

/** Search keeps matching subtrees or the ancestors of matching descendants. */
export function searchModelSceneTree(item: ModelSceneTreeItem, query: string): ModelSceneTreeItem | null {
  const term = query.trim().toLocaleLowerCase()
  if (!term || `${item.name} ${item.detail ?? ''}`.toLocaleLowerCase().includes(term)) return item
  const children = item.children.map(child => searchModelSceneTree(child, term)).filter((child): child is ModelSceneTreeItem => !!child)
  return children.length ? { ...item, children } : null
}

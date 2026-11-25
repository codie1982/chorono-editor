import type { Model3DData } from '../types'
import type { ModelSelection } from './types'
import { PRIMITIVE_SELECTION_INSTANCE, updatePrimitive } from '../modeling/poly/primitiveSource'
import { SCENE_OBJECT_SELECTION_INSTANCE, updateSceneObject } from '../source/modelSceneObjects'

export type ModelTransformTool = 'move' | 'rotate' | 'scale'
export type ModelAxis = 'x' | 'y' | 'z'

/** Apply one 3D gizmo sample to detached source. Move deltas are local model
 * units, rotate deltas are degrees and scale deltas are positive factors.
 * Primitive scale is uniform in v4; imported nodes have XYZ scale. No input is
 * mutated, and missing selections fail before the draft command is prepared. */
export function transformSelection(data: Model3DData, selection: ModelSelection, tool: ModelTransformTool, axis: ModelAxis, delta: number): Model3DData {
  if (!Number.isFinite(delta) || tool === 'scale' && delta <= 0) throw new Error('Invalid 3D transform gesture.')
  const limit = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
  if (selection.instanceId === SCENE_OBJECT_SELECTION_INSTANCE) return updateSceneObject(data, selection.nodeId, object => {
    if (tool === 'move') return { ...object, position: { ...object.position, [axis]: limit(object.position[axis] + delta, -1e5, 1e5) },
      target: { ...object.target, [axis]: limit(object.target[axis] + delta, -1e5, 1e5) } }
    const d = { x: object.position.x - object.target.x, y: object.position.y - object.target.y, z: object.position.z - object.target.z }
    let moved = d
    if (tool === 'scale') moved = { x: d.x * delta, y: d.y * delta, z: d.z * delta }
    else {
      const a = delta * Math.PI / 180, c = Math.cos(a), s = Math.sin(a)
      moved = axis === 'x' ? { x: d.x, y: d.y * c - d.z * s, z: d.y * s + d.z * c }
        : axis === 'y' ? { x: d.x * c + d.z * s, y: d.y, z: -d.x * s + d.z * c }
          : { x: d.x * c - d.y * s, y: d.x * s + d.y * c, z: d.z }
    }
    return { ...object, position: { x: object.target.x + moved.x, y: object.target.y + moved.y, z: object.target.z + moved.z } }
  })
  if (selection.instanceId === PRIMITIVE_SELECTION_INSTANCE) return updatePrimitive(data, selection.nodeId, object => {
    if (tool === 'scale') return { ...object, scale: limit(object.scale * delta, .001, 1000) }
    const field = tool === 'move' ? 'position' : 'rotation'
    return { ...object, [field]: { ...object[field], [axis]: limit(object[field][axis] + delta, -1e5, 1e5) } }
  })
  const content = data.content, instance = content?.instances[selection.instanceId], node = instance?.nodes[selection.nodeId]
  if (!content || !instance || !node) throw new Error('Selected 3D node is no longer available.')
  const field = tool === 'move' ? 'position' : tool === 'rotate' ? 'rotation' : 'scale'
  const value = tool === 'scale' ? limit(node.scale[axis] * delta, .001, 1000)
    : limit(node[field][axis] + delta, -1e6, 1e6)
  return { ...data, content: { ...content, instances: { ...content.instances, [selection.instanceId]: {
    ...instance, nodes: { ...instance.nodes, [selection.nodeId]: { ...node, [field]: { ...node[field], [axis]: value } } },
  } } } }
}

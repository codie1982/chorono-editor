import { describe, expect, it } from 'vitest'
import type { ModelInventory } from '../content/types'
import { contentInstance, withModelContent } from '../content/modelContent'
import { addPrimitive } from '../modeling/poly/primitiveSource'
import { modelDefaults, validateModel } from './modelDefaults'
import { modelSceneDeletionTargets, removeModelSceneObjects } from './modelSceneDeletion'

const vector = { x: 0, y: 0, z: 0 }
const inventory: ModelInventory = { revision: 'a'.repeat(64), nodes: [
  { id: 'n0', parentId: null, name: 'Root', kind: 'Mesh', materialIds: [], position: vector, rotation: vector,
    scale: { x: 1, y: 1, z: 1 }, visible: true },
  { id: 'n1', parentId: 'n0', name: 'Child', kind: 'Mesh', materialIds: [], position: vector, rotation: vector,
    scale: { x: 1, y: 1, z: 1 }, visible: true },
], clips: [], materials: {}, textures: [], textureColorSpaces: [] }

/** A mixed primitive/instance selection is deleted atomically at source level;
 * several selected nodes of one added model still denote one removable object. */
describe('3D scene object deletion', () => {
  it('removes unique objects and dependent exposed inputs while preserving the primary model', () => {
    const primary = withModelContent(modelDefaults('asset0'), inventory)
    const second = contentInstance('asset1', inventory, 'Added model')
    const data = addPrimitive(addPrimitive({ ...primary, content: { ...primary.content!, instances: { ...primary.content!.instances, second },
      parameters: { size: { name: 'Size', type: 'number', value: 1, min: .001, max: 2, target: 'model3d.content.instances.second.scale' } } } }, inventory, 'box', 'boxA'), inventory, 'sphere', 'sphereB')
    const targets = modelSceneDeletionTargets(data, [
      { instanceId: '@primitive', nodeId: 'boxA' }, { instanceId: 'second', nodeId: 'n0' },
      { instanceId: 'second', nodeId: 'n1' }, { instanceId: 'primary', nodeId: 'n0' },
    ])
    expect(targets).toEqual({ primitiveIds: ['boxA'], instanceIds: ['second'] })
    const next = removeModelSceneObjects(data, targets)
    expect(next.modeling?.objects.map(object => object.id)).toEqual(['sphereB'])
    expect(Object.keys(next.content!.instances)).toEqual(['primary'])
    expect(next.content!.parameters).toEqual({})
    expect(data.content!.instances.second).toBe(second)
    expect(() => validateModel(next)).not.toThrow()
  })

  it('leaves empty selection untouched and rejects removal of the primary source', () => {
    const data = withModelContent(modelDefaults('asset0'), inventory)
    expect(removeModelSceneObjects(data, modelSceneDeletionTargets(data, [{ instanceId: 'primary', nodeId: 'n0' }]))).toBe(data)
    expect(() => removeModelSceneObjects(data, { primitiveIds: [], instanceIds: ['primary'] })).toThrow(/cannot be removed/)
  })
})

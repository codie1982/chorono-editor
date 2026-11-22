import { describe, expect, it } from 'vitest'
import type { ModelInventory } from '../content/types'
import { withModelContent } from '../content/modelContent'
import { buildModelSceneTree } from '../inspection/modelSceneTree'
import { addPrimitive } from '../modeling/poly/primitiveSource'
import { modelDefaults, validateModel } from './modelDefaults'
import { renameModelSceneObject } from './modelSceneRename'
import { emptyScene } from '../../defaults'
import { newModelLayer } from './modelDefaults'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

const vector = { x: 0, y: 0, z: 0 }
const inventory: ModelInventory = { revision: 'a'.repeat(64), nodes: [{ id: 'n0', parentId: null, name: 'Imported mesh', kind: 'Mesh',
  materialIds: [], position: vector, rotation: vector, scale: { x: 1, y: 1, z: 1 }, visible: true }],
clips: [], materials: {}, textures: [], textureColorSpaces: [] }
const target = (kind: 'primitive' | 'instance' | 'node', nodeId?: string) =>
  ({ kind, instanceId: kind === 'primitive' ? '@primitive' : 'primary', nodeId, visible: true })

describe('3D Scene Explorer object rename', () => {
  it('renames a primitive and imported instance without changing IDs or the input', () => {
    const original = addPrimitive(modelDefaults('asset'), inventory, 'box', 'boxA')
    const primitive = renameModelSceneObject(original, target('primitive', 'boxA'), '  Housing  ')
    const renamed = renameModelSceneObject(primitive, target('instance'), '  Assembly  ')
    expect(original.modeling?.objects[0].name).toBe('Box')
    expect(renamed.modeling?.objects[0]).toMatchObject({ id: 'boxA', name: 'Housing' })
    expect(renamed.content?.instances.primary).toMatchObject({ assetId: 'asset', name: 'Assembly' })
    validateModel(renamed)
  })

  it('stores an imported node alias in the scene, preserving its inventory name and selection ID', () => {
    const original = withModelContent(modelDefaults('asset'), inventory)
    const renamed = renameModelSceneObject(original, target('node', 'n0'), 'Body')
    expect(inventory.nodes[0].name).toBe('Imported mesh')
    expect(original.content?.instances.primary.nodes.n0.name).toBeUndefined()
    expect(renamed.content?.instances.primary.nodes.n0.name).toBe('Body')
    const resource = { inventory } as Parameters<typeof buildModelSceneTree>[2]
    const tree = buildModelSceneTree('Scene', renamed, resource, () => undefined)
    expect(tree.children[0].children[0].children[0].children[0]).toMatchObject({ id: 'node:primary:n0', name: 'Body',
      selection: { instanceId: 'primary', nodeId: 'n0' } })
    validateModel(renamed)
    const scene = emptyScene()
    scene.layers = [{ ...newModelLayer('model', 'asset'), model3d: renamed }]
    expect(parseSceneJson(JSON.stringify(scene), true).layers[0].model3d?.content?.instances.primary.nodes.n0.name).toBe('Body')
  })

  it('rejects blank, oversized, and missing-object renames', () => {
    const source = withModelContent(modelDefaults('asset'), inventory)
    expect(() => renameModelSceneObject(source, target('node', 'n0'), '  ')).toThrow(/name/)
    expect(() => renameModelSceneObject(source, target('instance'), 'x'.repeat(81))).toThrow(/1–80/)
    expect(() => renameModelSceneObject(source, target('node', 'n9'), 'Missing')).toThrow(/no longer exists/)
    expect(() => renameModelSceneObject(source, target('primitive', 'boxA'), 'Missing')).toThrow(/no longer exists/)
    expect(source.content?.instances.primary.nodes.n0.name).toBeUndefined()
  })
})

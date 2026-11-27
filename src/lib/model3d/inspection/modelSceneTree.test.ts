import { describe, expect, it } from 'vitest'
import type { Model3DResource } from '../types'
import type { ModelInventory } from '../content/types'
import { modelDefaults, validateModel } from '../source/modelDefaults'
import { addPrimitive } from '../modeling/poly/primitiveSource'
import { buildModelSceneTree, searchModelSceneTree } from './modelSceneTree'
import { setModelTreeFlag, setModelTreeVisibility } from '../source/modelVisibility'
import { modelSelectionKey } from './modelSelection'
import { emptyScene } from '../../defaults'
import { newModelLayer } from '../source/modelDefaults'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

const node = (id: string, parentId: string | null) => ({ id, parentId, name: id === 'n0' ? 'Assembly' : 'Cube', kind: 'Mesh', materialIds: ['m0'],
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, visible: true })
const inventory: ModelInventory = { revision: '0'.repeat(64), nodes: [node('n0', null), node('n1', 'n0')], clips: [], materials: {}, textures: [], textureColorSpaces: [] }
const resource = { inventory, bytes: 0, draw: () => {}, dispose: () => {} } as Model3DResource
const lookup = () => undefined

describe('3D Scene Explorer hierarchy and visibility', () => {
  it('keeps nested imported nodes, geometry and material under their collection', () => {
    const tree = buildModelSceneTree('My Scene', modelDefaults('asset'), resource, lookup)
    expect(tree.children[0].name).toBe('My Scene')
    const group = tree.children[0].children.find(item => item.id === 'group:models')!
    const imported = group.children.find(item => item.kind === 'instance')!
    expect(imported.children[0].children[0].name).toBe('Cube')
    expect(imported.children[0].children[0].children[0].children[0].name).toBe('Material m0')
    const search = searchModelSceneTree(tree, 'Cube')!
    expect(search.children[0].children.map(item => item.id)).toEqual(['group:models'])
    expect(search.children[0].children[0].children[0].children[0].children[0].name).toBe('Cube')
  })

  it('persists eye edits without losing child overrides and filters isolation', () => {
    const original = addPrimitive(modelDefaults('asset'), inventory, 'box', 'boxA')
    const hidden = setModelTreeVisibility(original, { kind: 'instance', instanceId: 'primary', visible: true }, false, inventory)
    const childHidden = setModelTreeVisibility(hidden, { kind: 'node', instanceId: 'primary', nodeId: 'n1', visible: true }, false, inventory)
    const shown = setModelTreeVisibility(childHidden, { kind: 'instance', instanceId: 'primary', visible: false }, true, inventory)
    const primitiveHidden = setModelTreeVisibility(shown, { kind: 'primitive', instanceId: '@primitive', nodeId: 'boxA', visible: true }, false, inventory)
    expect(shown.content?.instances.primary.nodes.n1.visible).toBe(false)
    expect(primitiveHidden.modeling?.objects[0].visible).toBe(false)
    expect(original.content?.instances.primary.visible).toBeUndefined()
    validateModel(primitiveHidden)
    const portable = setModelTreeVisibility(primitiveHidden, { kind: 'instance', instanceId: 'primary', visible: true }, false, inventory)
    const scene = emptyScene(), layer = { ...newModelLayer('model', 'asset'), model3d: portable }
    scene.layers = [layer]
    expect(parseSceneJson(JSON.stringify(scene), true).layers[0].model3d?.content?.instances.primary.visible).toBe(false)
    expect(parseSceneJson(JSON.stringify(scene), true).layers[0].model3d?.modeling?.objects[0].visible).toBe(false)
    const isolated = buildModelSceneTree('My Scene', primitiveHidden, resource, lookup, new Set([modelSelectionKey({ instanceId: '@primitive', nodeId: 'boxA' })]))
    expect(isolated.children[0].children.map(item => item.id)).toEqual(['group:box'])
    expect(isolated.children[0].children[0].children[0].name).toBe('Box')
  })

  it('omits absent scene objects and creates only populated type collections', () => {
    const empty = { ...resource, isExplicitEmptyScene: true, inventory: { ...inventory, nodes: [] } }
    const base = modelDefaults('empty')
    expect(buildModelSceneTree('Empty', base, empty, lookup).children[0].children).toEqual([])
    const withBox = addPrimitive(base, empty.inventory, 'box', 'boxA')
    const withPlane = addPrimitive(withBox, empty.inventory, 'plane', 'planeA')
    const groups = buildModelSceneTree('Empty', withPlane, empty, lookup).children[0].children
    expect(groups.map(group => group.id)).toEqual(['group:box', 'group:plane'])
    expect(groups.flatMap(group => group.children.map(item => item.name))).toEqual(['Box', 'Plane'])
  })

  it('persists independent hide, freeze and output flags on real objects', () => {
    const base = addPrimitive(modelDefaults('asset'), inventory, 'box', 'boxA')
    const target = { kind: 'primitive' as const, instanceId: '@primitive', nodeId: 'boxA', visible: true }
    const frozen = setModelTreeFlag(base, target, 'frozen', true, inventory)
    const editorOnly = setModelTreeFlag(frozen, target, 'renderable', false, inventory)
    const hidden = setModelTreeFlag(editorOnly, target, 'visible', false, inventory)
    expect(hidden.modeling?.objects[0]).toMatchObject({ frozen: true, renderable: false, visible: false })
    expect(base.modeling?.objects[0].frozen).toBeUndefined()
    validateModel(hidden)
    const scene = emptyScene(); scene.layers = [{ ...newModelLayer('model', 'asset'), model3d: hidden }]
    expect(parseSceneJson(JSON.stringify(scene), true).layers[0].model3d?.modeling?.objects[0]).toMatchObject({ frozen: true, renderable: false, visible: false })
  })
})

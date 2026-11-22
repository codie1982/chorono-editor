import { describe, expect, it } from 'vitest'
import { emptyScene } from '../../../defaults'
import { ModelClipDraft } from '../../../editor/detail/ModelClipDraft'
import { parseSceneJson } from '../../../format/scene/SceneJsonConverter'
import { cloneSingleLayer } from '../../../clone/CloneSingleLayer'
import type { ModelInventory } from '../../content/types'
import { newModelLayer, validateModel } from '../../source/modelDefaults'
import { addPrimitive, assertModelingSource, removePrimitive, updatePrimitive } from './primitiveSource'
import { PrimitiveScene } from './PrimitiveScene'
import '../../../registry/bootstrap'

const inventory: ModelInventory = { revision: '0'.repeat(64), nodes: [], clips: [], materials: {}, textures: [], textureColorSpaces: [] }
const source = () => { const layer = newModelLayer('model', 'asset'); return { ...emptyScene(), layers: [layer],
  assets: [{ id: 'asset', type: 'model3d' as const, name: 'Empty', url: 'data:model/gltf+json;base64,e30=' }] } }

describe('polygon primitive source', () => {
  it('promotes only on an authored add, preserves legacy data, and removes by stable ID', () => {
    const legacy = source().layers[0].model3d!, before = JSON.stringify(legacy)
    let model = addPrimitive(legacy, inventory, 'box', 'boxA')
    expect(model.version).toBe(4)
    expect(model.modeling?.objects[0]).toMatchObject({ id: 'boxA', geometry: { kind: 'box', width: 1, height: 1, depth: 1 } })
    model = addPrimitive(model, inventory, 'sphere', 'sphereB')
    model = updatePrimitive(model, 'boxA', box => ({ ...box, position: { ...box.position, x: 2 }, geometry: { kind: 'box', width: 3, height: 1, depth: 1 } }))
    expect(model.modeling?.objects.map(object => object.id)).toEqual(['boxA', 'sphereB'])
    expect(removePrimitive(model, 'boxA').modeling?.objects.map(object => object.id)).toEqual(['sphereB'])
    expect(JSON.stringify(legacy)).toBe(before)
    validateModel(model)
  })

  it('rejects invalid dimensions, duplicate IDs and source-version downgrades', () => {
    const model = addPrimitive(source().layers[0].model3d!, inventory, 'cylinder', 'cylinderA')
    expect(() => addPrimitive(model, inventory, 'box', 'cylinderA')).toThrow('already exists')
    expect(() => assertModelingSource({ version: 1, objects: [model.modeling!.objects[0], model.modeling!.objects[0]] })).toThrow('identity')
    expect(() => validateModel(updatePrimitive(model, 'cylinderA', object => ({ ...object, scale: 0 })))).toThrow('placement')
    expect(() => validateModel({ ...model, version: 3 })).toThrow('version 4')
    expect(() => validateModel({ ...model, modeling: undefined })).toThrow('modeling source')
    expect(() => validateModel({ ...model, modeling: { ...model.modeling!, stacks: [{ id: 'future' }] } } as typeof model)).toThrow('modeling source')
  })

  it('survives private draft, portable save/reopen and source cloning', () => {
    const scene = source(), draft = new ModelClipDraft(scene, scene.layers[0])
    draft.registerInventory('asset', inventory)
    const model = addPrimitive(draft.layer.model3d!, inventory, 'cone', 'coneA')
    const edited = { ...draft.initial, layers: [{ ...draft.layer, model3d: model }] }
    const committed = draft.model(edited)
    expect(committed.version).toBe(4)
    const saved = parseSceneJson(JSON.stringify({ ...scene, layers: [{ ...scene.layers[0], model3d: committed }] }), true)
    expect(saved.layers[0].model3d?.modeling?.objects[0].id).toBe('coneA')
    const reopened = new ModelClipDraft(saved, saved.layers[0])
    expect(reopened.model(reopened.initial)).toEqual(committed)
    const copy = cloneSingleLayer(saved.layers[0]).clonedLayer
    expect(copy.model3d?.modeling?.objects[0].id).toBe('coneA')
    copy.model3d!.modeling!.objects[0].color = '#ff0000'
    expect(saved.layers[0].model3d?.modeling?.objects[0].color).not.toBe('#ff0000')
  })

  it('reuses geometry across placement edits and disposes removed meshes', () => {
    const base = addPrimitive(source().layers[0].model3d!, inventory, 'box', 'boxA')
    const scene = new PrimitiveScene()
    scene.configure(base.modeling, false)
    const first = scene.getNode('boxA')!, geometry = first.geometry
    scene.configure(updatePrimitive(base, 'boxA', object => ({ ...object, position: { ...object.position, x: 3 } })).modeling, true)
    expect(scene.getNode('boxA')?.geometry).toBe(geometry)
    expect(scene.getNode('boxA')?.position.x).toBe(3)
    scene.configure(removePrimitive(base, 'boxA').modeling, false)
    expect(scene.getNode('boxA')).toBeUndefined()
    scene.dispose()
  })

  it('creates bounded geometry for every available primitive type', () => {
    let model = source().layers[0].model3d!
    for (const kind of ['box', 'sphere', 'cylinder', 'cone', 'plane'] as const) model = addPrimitive(model, inventory, kind, kind)
    const scene = new PrimitiveScene()
    scene.configure(model.modeling, false)
    for (const kind of ['box', 'sphere', 'cylinder', 'cone', 'plane'] as const) {
      const geometry = scene.getNode(kind)?.geometry
      geometry?.computeBoundingBox()
      expect(geometry?.getAttribute('position').count).toBeGreaterThan(0)
      expect(geometry?.boundingBox?.isEmpty()).toBe(false)
      if (kind === 'plane') {
        expect(geometry?.boundingBox?.min.y).toBeCloseTo(0)
        expect(geometry?.boundingBox?.max.y).toBeCloseTo(0)
        expect(geometry?.boundingBox?.max.x).toBeCloseTo(.5)
        expect(geometry?.boundingBox?.max.z).toBeCloseTo(.5)
      }
    }
    scene.dispose()
  })

  it('persists primitive PBR factors and applies them without rebuilding topology', () => {
    const base = addPrimitive(source().layers[0].model3d!, inventory, 'box', 'boxA')
    const scene = new PrimitiveScene()
    scene.configure(base.modeling, false)
    const geometry = scene.getNode('boxA')!.geometry
    const edited = updatePrimitive(base, 'boxA', object => ({ ...object, material: {
      roughness: .24, metalness: .83, opacity: .45, alphaMode: 'blend', emissiveColor: '#ff3300', emissiveIntensity: 2,
    } }))
    validateModel(edited)
    scene.configure(edited.modeling, false)
    const material = scene.getNode('boxA')!.material as import('three').MeshStandardMaterial
    expect(scene.getNode('boxA')!.geometry).toBe(geometry)
    expect([material.roughness, material.metalness, material.opacity, material.transparent, material.emissive.getHexString()])
      .toEqual([.24, .83, .45, true, 'ff3300'])
    const saved = parseSceneJson(JSON.stringify({ ...source(), layers: [{ ...source().layers[0], model3d: edited }] }), true)
    expect(saved.layers[0].model3d?.modeling?.objects[0].material).toEqual(edited.modeling?.objects[0].material)
    expect(() => validateModel(updatePrimitive(edited, 'boxA', object => ({ ...object, material: { roughness: 2 } })))).toThrow(/material/)
    scene.dispose()
  })
})

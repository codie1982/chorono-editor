import { describe, expect, it } from 'vitest'
import { emptyScene, cloneLayerForDuplicate } from '../../defaults'
import { newStructuredGridMesh2DLayer } from '../../registry/definitions/mesh2d/Mesh2DDefinition'
import { StructuredGridMesh2DGenerator } from '../../geometry/mesh2d/StructuredGridMesh2DGenerator'
import { geometryModifierRegistry, modifierStackService, projectModifierStacks } from '..'
import { prepareAddModifier, makeExecuteModifierStackCmd, makeToggleModifierCmd, makeRemoveModifierCmd, makeMoveModifierCmd, makeBakeModifierStackCmd } from '../../editor/modifiers/commands'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { defaultRuntimeSceneCompiler } from '../../export/runtime/RuntimeSceneCompiler'
import { resolveInstanceLayer } from '../../clone/InstanceResolver'
import { Mesh2DTopologyHasher } from '../../geometry/mesh2d/Mesh2DTopologyHasher'
import { Mesh2DTopologyValidator } from '../../geometry/mesh2d/Mesh2DTopologyValidator'
import type { ChronoScene } from '../../types'

/** Small independent mesh with exact UVs and visible boundary motion. */
function fixture(): ChronoScene {
  const layer = { ...newStructuredGridMesh2DLayer(), id: 'mesh', mesh2d: new StructuredGridMesh2DGenerator().generate({ width: 100, height: 60, columns: 1, rows: 1 }) }
  return { ...emptyScene(), layers: [layer] }
}
function add(scene: ChronoScene, type: string) {
  const plan = prepareAddModifier(scene, 'mesh', type)
  return { ...plan, scene: plan.command.execute(scene) }
}

describe('registered Mesh Smooth / Subdivision stack', () => {
  it('registers independent Mesh settings with Delaunay as the primary algorithm', () => {
    for (const type of ['meshSmooth', 'meshSubdivision']) expect(geometryModifierRegistry.get(type).descriptor).toMatchObject({ category: 'mesh', inputs: ['mesh2d'], output: 'mesh2d', addable: true })
    const definition = geometryModifierRegistry.get('meshSubdivision')
    expect(definition.defaults({ kind: 'mesh2d', mesh: fixture().layers[0].mesh2d! })).toMatchObject({ algorithm: 'delaunay' })
    expect(definition.descriptor.fields.find(field => field.key === 'algorithm')!.options!.map(item => item.value)).toEqual(['delaunay', 'grid'])
  })
  it('rebuilds Grid levels from original source, atomically, with exact Undo/Redo', () => {
    const base = fixture(), plan = add(base, 'meshSubdivision'), id = plan.modifierId
    expect(plan.warning).toBeUndefined()
    const command = makeExecuteModifierStackCmd(plan.scene, 'mesh', { [id]: { algorithm: 'grid', levels: 1 } })
    const first = command.execute(plan.scene)
    expect(first.layers[0].mesh2d!.geometry.topology.quadIndices).toHaveLength(60)
    const next = makeExecuteModifierStackCmd(first, 'mesh', { [id]: { levels: 2 } }).execute(first)
    expect(next.layers[0].mesh2d!.geometry.topology.quadIndices).toHaveLength(240)
    expect(next.layers[0].modifierStack!.source).toEqual({ kind: 'mesh2d', mesh: { ...base.layers[0].mesh2d, deformation: undefined } })
    expect(command.undo(first)).toBe(plan.scene)
    expect(command.execute(plan.scene)).toBe(first)
    expect(() => makeExecuteModifierStackCmd(first, 'mesh', { [id]: { levels: 1.5 } })).toThrow(/integer/)
  })
  it('applies Smooth/Subdivision in actual stack order, preserving upstream settings', () => {
    const subdivided = add(fixture(), 'meshSubdivision'), smoothed = add(subdivided.scene, 'meshSmooth')
    expect(smoothed.warning).toBeUndefined()
    const before = smoothed.scene.layers[0].mesh2d!.geometry
    const moved = makeMoveModifierCmd(smoothed.scene, 'mesh', smoothed.modifierId, -1).execute(smoothed.scene)
    expect(moved.layers[0].modifierStack!.modifiers.map(item => item.type)).toEqual(['meshSmooth', 'meshSubdivision'])
    expect(moved.layers[0].mesh2d!.geometry).not.toEqual(before)
    const disabled = makeToggleModifierCmd(smoothed.scene, 'mesh', smoothed.modifierId, false).execute(smoothed.scene)
    expect(disabled.layers[0].mesh2d!.geometry).toEqual(subdivided.scene.layers[0].mesh2d!.geometry)
    const removed = makeRemoveModifierCmd(smoothed.scene, 'mesh', smoothed.modifierId).execute(smoothed.scene)
    expect(removed.layers[0].mesh2d!.geometry).toEqual(subdivided.scene.layers[0].mesh2d!.geometry)
  })
  it.each(['delaunay', 'grid'] as const)('keeps %s results through portable load, clone/instance, render, Bake and runtime', algorithm => {
    const added = add(fixture(), 'meshSubdivision')
    const scene = makeExecuteModifierStackCmd(added.scene, 'mesh', { [added.modifierId]: { algorithm } }).execute(added.scene)
    const mesh = scene.layers[0].mesh2d!, loaded = parseSceneJson(JSON.stringify(scene), true)
    expect(loaded.layers[0].mesh2d).toEqual(mesh)
    expect(projectModifierStacks(loaded).layers[0].mesh2d).toEqual(mesh)
    const copy = cloneLayerForDuplicate(scene.layers[0])
    expect(copy.modifierStack).toEqual(scene.layers[0].modifierStack)
    expect(copy.modifierStack).not.toBe(scene.layers[0].modifierStack)
    expect(modifierStackService.execute(copy, copy.modifierStack!).mesh2d).toEqual(mesh)
    expect(resolveInstanceLayer({ ...copy, instanceOf: 'mesh' }, scene.layers)!.mesh2d).toEqual(mesh)
    expect(defaultRuntimeSceneCompiler.compile(scene).layers[0]).toMatchObject({ type: 'mesh2d', mesh2d: mesh })
    const baked = makeBakeModifierStackCmd(scene, 'mesh').execute(scene)
    expect(baked.layers[0].modifierStack).toBeUndefined()
    expect(baked.layers[0].mesh2d!.source.kind).toBe('authored')
    expect(baked.layers[0].mesh2d!.geometry).toEqual(mesh.geometry)
  })
  it('refuses modeling after bound deformation and refuses pin invalidation', () => {
    const initial = fixture(), layer = initial.layers[0]
    const bound = { ...initial, layers: [{ ...layer, mesh2d: { ...layer.mesh2d!, deformation: { schemaVersion: 1 as const, assetId: 'clip', startTimeMs: 0, playbackRate: 1, loop: false } } }] }
    const blocked = add(bound, 'meshSubdivision')
    expect(blocked.warning).toMatch(/before Deformation Clip/)
    expect(blocked.scene.layers[0].mesh2d!.geometry).toEqual(layer.mesh2d!.geometry)
    expect(() => makeToggleModifierCmd(blocked.scene, 'mesh', blocked.modifierId, true)).toThrow(/before Deformation Clip/)
    const pinned = { ...initial, layers: [{ ...layer, mesh2d: { ...layer.mesh2d!, pins: { schemaVersion: 1 as const, topologyHash: layer.mesh2d!.geometry.topology.topologyHash, vertexIds: [layer.mesh2d!.geometry.topology.vertexIds[0]] } } }] }
    expect(add(pinned, 'meshSmooth').warning).toMatch(/Remove Mesh pins/)
  })
  it('includes quad connectivity in the hash while retaining legacy hashes and validating cells', () => {
    const grid = add(fixture(), 'meshSubdivision')
    const scene = makeExecuteModifierStackCmd(grid.scene, 'mesh', { [grid.modifierId]: { algorithm: 'grid' } }).execute(grid.scene)
    const geometry = scene.layers[0].mesh2d!.geometry, hash = new Mesh2DTopologyHasher()
    const legacy = { ...geometry.topology, quadIndices: undefined }
    expect(hash.hash(legacy)).not.toBe(geometry.topology.topologyHash)
    const invalid = { ...geometry, topology: { ...geometry.topology, quadIndices: [0, 0, 1, 2] } }
    expect(new Mesh2DTopologyValidator().validate(invalid).diagnostics.some(item => item.code === 'invalid-quad-cell')).toBe(true)
  })
})

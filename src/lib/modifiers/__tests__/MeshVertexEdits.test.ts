import { describe, expect, it } from 'vitest'
import { emptyScene } from '../../defaults'
import { newStructuredGridMesh2DLayer } from '../../registry/definitions/mesh2d/Mesh2DDefinition'
import { makeTransformMeshGeometryCmd } from '../../editor/modifiers/commands'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
const identity = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 }
describe('Point/Edge edits in the same Edit Mesh', () => {
  it('changes only selected vertices, composes later whole-mesh edits and survives portable save', () => {
    const layer = newStructuredGridMesh2DLayer(), scene = { ...emptyScene(), layers: [layer] }, geometry = layer.mesh2d!.geometry
    const id = geometry.topology.vertexIds[20]
    const command = makeTransformMeshGeometryCmd(scene, layer.id, 'edit', { ...identity, x: 2, y: -1 }, [id])
    const moved = command.execute(scene), edited = moved.layers[0].mesh2d!.geometry
    edited.positions.forEach((value, i) => expect(value).toBe(geometry.positions[i] + (Math.floor(i / 2) === 20 ? i % 2 ? -1 : 2 : 0)))
    expect(edited.topology).toEqual(geometry.topology); expect(edited.uvs).toEqual(geometry.uvs)
    const whole = makeTransformMeshGeometryCmd(moved, layer.id, 'edit', { ...identity, x: 5, y: 7 }).execute(moved)
    expect(whole.layers[0].modifierStack!.modifiers.filter(record => record.type === 'meshTransform')).toHaveLength(1)
    expect(whole.layers[0].mesh2d!.geometry.positions).toEqual(edited.positions.map((value, i) => value + (i % 2 ? 7 : 5)))
    expect(whole.layers[0].transform).toEqual(layer.transform)
    expect(command.undo(moved)).toBe(scene)
    expect(parseSceneJson(JSON.stringify(whole)).layers[0].mesh2d!.geometry.positions).toEqual(whole.layers[0].mesh2d!.geometry.positions)
  })
  it('rejects invalid topology edits atomically', () => {
    const layer = newStructuredGridMesh2DLayer(), scene = { ...emptyScene(), layers: [layer] }, saved = structuredClone(scene)
    const id = layer.mesh2d!.geometry.topology.vertexIds[0]
    expect(() => makeTransformMeshGeometryCmd(scene, layer.id, 'edit', { ...identity, x: 1000, y: 1000 }, [id])).toThrow(/collapses|reverses/)
    expect(scene).toEqual(saved)
  })
})

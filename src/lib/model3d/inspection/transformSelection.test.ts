import { describe, expect, it } from 'vitest'
import { modelDefaults, validateModel } from '../source/modelDefaults'
import { withModelContent } from '../content/modelContent'
import type { ModelInventory } from '../content/types'
import { addPrimitive, PRIMITIVE_SELECTION_INSTANCE } from '../modeling/poly/primitiveSource'
import { transformSelection } from './transformSelection'

const inventory: ModelInventory = { revision: 'a'.repeat(64), nodes: [{ id: 'n0', parentId: null, name: 'Part', kind: 'Mesh',
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, visible: true, materialIds: [] }],
  clips: [], materials: {}, textures: [], textureColorSpaces: [] }
const source = () => addPrimitive(withModelContent(modelDefaults('asset'), inventory), inventory, 'box', 'boxA')

describe('3D viewport source transforms', () => {
  it('moves and rotates the selected primitive without changing its geometry or baseline', () => {
    const original = source(), selection = { instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'boxA' }
    const moved = transformSelection(original, selection, 'move', 'z', 2)
    const rotated = transformSelection(moved, selection, 'rotate', 'y', 90)
    const scaled = transformSelection(rotated, selection, 'scale', 'x', 1.5)
    expect(scaled.modeling!.objects[0]).toMatchObject({ geometry: { width: 1, height: 1, depth: 1 }, position: { z: 2 }, rotation: { y: 90 }, scale: 1.5 })
    expect(original.modeling!.objects[0]).toMatchObject({ position: { z: 0 }, rotation: { y: 0 }, scale: 1 })
    expect(scaled.content).toBe(original.content)
    expect(() => validateModel(scaled)).not.toThrow()
  })

  it('edits imported node XYZ independently of primitive state', () => {
    const original = source(), selection = { instanceId: 'primary', nodeId: 'n0' }
    const moved = transformSelection(original, selection, 'move', 'x', .25)
    const rotated = transformSelection(moved, selection, 'rotate', 'z', 15)
    const scaled = transformSelection(rotated, selection, 'scale', 'y', 1.2)
    expect(scaled.content!.instances.primary.nodes.n0).toMatchObject({ position: { x: .25 }, rotation: { z: 15 }, scale: { x: 1, y: 1.2, z: 1 } })
    expect(scaled.modeling).toBe(original.modeling)
    expect(original.content!.instances.primary.nodes.n0).toMatchObject({ position: { x: 0 }, rotation: { z: 0 }, scale: { y: 1 } })
    expect(() => validateModel(scaled)).not.toThrow()
  })

  it('rejects missing references and invalid scale factors before a source write', () => {
    const data = source()
    expect(() => transformSelection(data, { instanceId: 'primary', nodeId: 'missing' }, 'move', 'x', 1)).toThrow('no longer available')
    expect(() => transformSelection(data, { instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'missing' }, 'move', 'x', 1)).toThrow('no longer exists')
    expect(() => transformSelection(data, { instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'boxA' }, 'scale', 'x', 0)).toThrow('Invalid')
    expect(() => transformSelection(data, { instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: 'boxA' }, 'rotate', 'y', NaN)).toThrow('Invalid')
  })
})

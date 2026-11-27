import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer, cloneLayerForDuplicate } from '../../defaults'
import { prepareGeometryConversion } from '../../editor/commands-geometry-conversion'
import { makeTransformMeshGeometryCmd, makeToggleModifierCmd, prepareAddModifier } from '../../editor/modifiers/commands'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { defaultRuntimeSceneCompiler } from '../../export/runtime/RuntimeSceneCompiler'
import { previewGeometryDrag } from '../../../components/canvas/hooks/drag/geometryDragPreview'
import { commitCanvasDrag } from '../../../components/canvas/hooks/drag/commitCanvasDrag'
import type { MeshGeometryDrag } from '../../../components/canvas/types/canvasDragTypes'
import type { EditorStateReturn } from '../../../app/hooks/useEditorState'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { Matrix2D } from '../../geometry/Matrix2D'

/** Converted shape retains its real centered anchor, placement and source. */
function fixture() {
  const source = newRectLayer(), scene = { ...emptyScene(), layers: [source] }
  return prepareGeometryConversion(scene, [source.id], 'mesh2d').command.execute(scene)
}
const identity = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 }

describe('Edit Mesh geometry and fixed object origin', () => {
  it('accumulates ordered move/rotate/scale in one stage with separate exact Undo commands', () => {
    const before = fixture(), layer = before.layers[0], pivot = { pivotX: 10, pivotY: 20 }
    const move = makeTransformMeshGeometryCmd(before, layer.id, 'session', { ...identity, ...pivot, x: 20, y: -7 })
    const moved = move.execute(before)
    const rotate = makeTransformMeshGeometryCmd(moved, layer.id, 'session', { ...identity, ...pivot, rotation: 90 })
    const rotated = rotate.execute(moved)
    const scale = makeTransformMeshGeometryCmd(rotated, layer.id, 'session', { ...identity, ...pivot, scaleX: 2, scaleY: 2 })
    const scaled = scale.execute(rotated), mesh = scaled.layers[0].mesh2d!.geometry
    for (let i = 0; i < mesh.positions.length; i += 2) {
      const x = layer.mesh2d!.geometry.positions[i] + 20, y = layer.mesh2d!.geometry.positions[i + 1] - 7
      expect(mesh.positions[i]).toBeCloseTo(10 - (y - 20) * 2)
      expect(mesh.positions[i + 1]).toBeCloseTo(20 + (x - 10) * 2)
    }
    expect(scaled.layers[0].modifierStack!.modifiers.filter(item => item.type === 'meshTransform')).toHaveLength(1)
    expect(scaled.layers[0].transform).toEqual(layer.transform)
    expect(scale.undo(scaled)).toBe(rotated); expect(rotate.undo(rotated)).toBe(moved); expect(move.undo(moved)).toBe(before)
    expect(scale.execute(rotate.execute(move.execute(before)))).toEqual(scaled)
    expect(parseSceneJson(JSON.stringify(scaled), true).layers[0]).toEqual(scaled.layers[0])
  })
  it('does not exhaust the stack for repeated edits and restores each movement independently', () => {
    let scene = fixture()
    const initial = scene, id = scene.layers[0].id, history: { before: typeof scene; command: EditorCommand }[] = []
    for (let i = 0; i < 40; i++) {
      const command = makeTransformMeshGeometryCmd(scene, id, 'session', { ...identity, x: 1, y: 2 })
      history.push({ before: scene, command }); scene = command.execute(scene)
    }
    expect(scene.layers[0].modifierStack!.modifiers).toHaveLength(3)
    expect(scene.layers[0].mesh2d!.geometry.positions[0]).toBeCloseTo(initial.layers[0].mesh2d!.geometry.positions[0] + 40)
    for (const entry of history.reverse()) { scene = entry.command.undo(scene); expect(scene).toBe(entry.before) }
    expect(scene).toBe(initial)
  })
  it('refuses changing a disabled/non-tail stage or a composition requiring shear atomically', () => {
    const before = fixture(), id = before.layers[0].id
    const rotated = makeTransformMeshGeometryCmd(before, id, 'session', { ...identity, rotation: 45 }).execute(before)
    const saved = structuredClone(rotated)
    expect(() => makeTransformMeshGeometryCmd(rotated, id, 'session', { ...identity, scaleX: 2 })).toThrow(/shear/)
    expect(rotated).toEqual(saved)
    const disabled = makeToggleModifierCmd(rotated, id, 'session', false).execute(rotated)
    expect(() => makeTransformMeshGeometryCmd(disabled, id, 'session', identity)).toThrow(/enabled at the end/)
    const plan = prepareAddModifier(rotated, id, 'meshSmooth'), downstream = plan.command.execute(rotated)
    expect(() => makeTransformMeshGeometryCmd(downstream, id, 'session', identity)).toThrow(/end of the stack/)
  })
  it('moves local vertices through a persisted stage, preserving layer TRS, UVs, topology and exact Undo', () => {
    const before = fixture(), source = before.layers[0], geometry = source.mesh2d!.geometry
    const command = makeTransformMeshGeometryCmd(before, source.id, 'edit-move', { ...identity, x: 20, y: -7 })
    const after = command.execute(before), layer = after.layers[0], mesh = layer.mesh2d!.geometry
    expect(layer.transform).toEqual(source.transform)
    expect(after.timelines).toBe(before.timelines)
    expect(mesh.positions).toEqual(geometry.positions.map((value, i) => value + (i % 2 ? -7 : 20)))
    expect(mesh.uvs).toEqual(geometry.uvs); expect(mesh.topology).toEqual(geometry.topology)
    expect(layer.modifierStack!.source).toEqual(source.modifierStack!.source)
    expect(layer.modifierStack!.modifiers.at(-1)!.type).toBe('meshTransform')
    expect(command.undo(after)).toBe(before)
    expect(command.execute(command.undo(after))).toEqual(after)
  })
  it('rotates and scales local points about the chosen fixed local pivot', () => {
    const before = fixture(), source = before.layers[0], values = source.mesh2d!.geometry.positions
    const settings = { ...identity, rotation: 90, scaleX: 2, scaleY: .5, pivotX: 10, pivotY: 20 }
    const after = makeTransformMeshGeometryCmd(before, source.id, 'edit-rs', settings).execute(before).layers[0]
    expect(after.transform).toEqual(source.transform)
    for (let i = 0; i < values.length; i += 2) {
      expect(after.mesh2d!.geometry.positions[i]).toBeCloseTo(10 - (values[i + 1] - 20) * .5)
      expect(after.mesh2d!.geometry.positions[i + 1]).toBeCloseTo(20 + (values[i] - 10) * 2)
    }
  })
  it('rejects singular edits/pinned ownership without changing input and permits disabling a saved edit', () => {
    const before = fixture(), source = before.layers[0], saved = structuredClone(before)
    expect(() => makeTransformMeshGeometryCmd(before, source.id, 'bad', { ...identity, scaleX: 0 })).toThrow(/scaleX/)
    expect(before).toEqual(saved)
    const after = makeTransformMeshGeometryCmd(before, source.id, 'edit', { ...identity, x: 30 }).execute(before)
    const disabled = makeToggleModifierCmd(after, source.id, 'edit', false).execute(after)
    expect(disabled.layers[0].mesh2d!.geometry).toEqual(source.mesh2d!.geometry)
    const mesh = source.mesh2d!
    const pinned = { ...before, layers: [{ ...source, mesh2d: { ...mesh, pins: { schemaVersion: 1 as const,
      topologyHash: mesh.geometry.topology.topologyHash, vertexIds: [mesh.geometry.topology.vertexIds[0]] } } }] }
    expect(() => makeTransformMeshGeometryCmd(pinned, source.id, 'pins', { ...identity, x: 5 })).toThrow(/pins/)
  })
  it('round-trips, clones independently and exports final local geometry', () => {
    const before = fixture(), id = before.layers[0].id
    const after = makeTransformMeshGeometryCmd(before, id, 'edit', { ...identity, x: 17 }).execute(before)
    const loaded = parseSceneJson(JSON.stringify(after), true), copy = cloneLayerForDuplicate(loaded.layers[0])
    expect(loaded.layers[0]).toEqual(after.layers[0])
    expect(copy.modifierStack).toEqual(loaded.layers[0].modifierStack)
    expect(copy.modifierStack).not.toBe(loaded.layers[0].modifierStack)
    const runtime = defaultRuntimeSceneCompiler.compile(loaded)
    expect(runtime.layers[0].mesh2d!.geometry.positions).toEqual(after.layers[0].mesh2d!.geometry.positions)
    expect(runtime.layers[0].transform).toEqual(before.layers[0].transform)
  })
  it('previews from the baseline and commits one geometry command without producing layer keyframes', () => {
    const before = fixture(), layer = before.layers[0]
    const drag: MeshGeometryDrag = { kind: 'meshGeometry', layerId: layer.id, originalLayer: layer,
      modifierId: 'gesture-edit', operation: 'move', startClientX: 0, startClientY: 0,
      startLocal: { x: 0, y: 0 }, pivot: { x: 0, y: 0 }, worldToLocal: Matrix2D.identity() }
    const input = { base: before, drag, event: { pointerId: 1, clientX: 20, clientY: 10, shiftKey: false, metaKey: false, ctrlKey: false },
      delta: { x: 20, y: 10 }, snap: { grid: false, pixel: false, size: 1 } }
    const first = previewGeometryDrag(input), second = previewGeometryDrag({ ...input, delta: { x: 40, y: 20 } })
    expect(second.scene.layers[0].mesh2d!.geometry.positions[0] - first.scene.layers[0].mesh2d!.geometry.positions[0]).toBeCloseTo(20)
    expect(second.scene.layers[0].modifierStack!.modifiers.filter(record => record.type === 'meshTransform')).toHaveLength(1)
    const keys = vi.fn(), commit = vi.fn()
    commitCanvasDrag({ commitTransaction: commit } as unknown as EditorStateReturn, before, drag, second,
      { onSelectLayer: vi.fn(), buildLayerCommitCommands: keys })
    expect(keys).not.toHaveBeenCalled(); expect(commit).toHaveBeenCalledTimes(1)
    const command = commit.mock.calls[0][0] as EditorCommand
    expect(command.execute(before).layers[0].transform).toEqual(layer.transform)
    expect(command.undo(second.scene)).toBe(before)
  })
})

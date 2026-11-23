import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData, cloneLayerForDuplicate } from '../../defaults'
import { createRectangleSpline } from '../../spline'
import { geometryModifierRegistry, modifierStackService, projectModifierStacks } from '..'
import { prepareAddModifier, makeExecuteModifierStackCmd, makeMoveModifierCmd, makeToggleModifierCmd, makeRemoveModifierCmd, makeBakeModifierStackCmd } from '../../editor/modifiers/commands'
import { prepareGeometryConversion } from '../../editor/commands-geometry-conversion'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { defaultRuntimeSceneCompiler } from '../../export/runtime/RuntimeSceneCompiler'
import type { ChronoScene } from '../../types'

const types = ['pathResample', 'zigZag', 'puckerBloat', 'splineRepeater'] as const
/** Native stack commands over real source, no simulated UI/math implementation. */
function fixture() { const scene = emptyScene(), layer = newSplineLayerFromData(createRectangleSpline({ width: 100, height: 80 })); scene.layers = [layer]; layer.transform = { ...layer.transform, x: 200, rotationDeg: 23, scaleX: 1.4, anchorX: 5 }; return { scene, layer } }
function add(scene: ChronoScene, type: string) { const plan = prepareAddModifier(scene, scene.layers[0].id, type); return { ...plan, scene: plan.command.execute(scene) } }

describe('Phase 1 static modifier pipeline', () => {
  it.each(types)('%s has validated settings, deterministic output, portable source and exact native history/clone/runtime contracts', type => {
    const { scene, layer } = fixture(), before = structuredClone(scene), result = add(scene, type), stack = result.scene.layers[0].modifierStack!
    expect(result.warning).toBeUndefined(); expect(stack.modifiers[0].enabled).toBe(true)
    expect(modifierStackService.execute(result.scene.layers[0], stack)).toEqual(result.scene.layers[0])
    expect(parseSceneJson(JSON.stringify(result.scene), true).layers[0]).toEqual(result.scene.layers[0])
    expect(projectModifierStacks(result.scene).layers[0].spline).toEqual(result.scene.layers[0].spline)
    expect(defaultRuntimeSceneCompiler.compile(result.scene).layers[0].spline).toEqual(result.scene.layers[0].spline)
    const clone = cloneLayerForDuplicate(result.scene.layers[0]); expect(clone.modifierStack).toEqual(stack); expect(clone.modifierStack).not.toBe(stack)
    expect(result.scene.layers[0].transform).toEqual(layer.transform); expect(result.scene.layers[0].style).toEqual(layer.style)
    const undone = result.command.undo(result.scene); expect(undone).toEqual(before); expect(result.command.execute(undone)).toEqual(result.scene); expect(scene).toEqual(before)
    const mesh = prepareGeometryConversion(result.scene, [layer.id], 'mesh2d').command.execute(result.scene)
    expect(mesh.layers[0].mesh2d!.geometry.topology.triangleIndices.length).toBeGreaterThan(0)
  })
  it('composes all four in order, preserves source, and supports settings/order/toggle/remove/Bake independently', () => {
    const original = fixture(); let scene = original.scene
    for (const type of types) { const result = add(scene, type); expect(result.warning).toBeUndefined(); scene = result.scene }
    const layer = scene.layers[0], stack = layer.modifierStack!
    expect(stack.source).toEqual({ kind: 'spline', spline: original.layer.spline }); expect(stack.modifiers.map(item => item.type)).toEqual(types)
    const repeater = stack.modifiers.at(-1)!, pucker = stack.modifiers[2]
    const executed = makeExecuteModifierStackCmd(scene, layer.id, { [repeater.id]: { count: 2 }, [pucker.id]: { amountPct: -10 } }), smaller = executed.execute(scene)
    expect(Object.keys(smaller.layers[0].spline!.subShapes)).toHaveLength(2); expect(executed.undo(smaller)).toEqual(scene)
    const moved = makeMoveModifierCmd(smaller, layer.id, repeater.id, -1).execute(smaller)
    expect(moved.layers[0].modifierStack!.modifiers[2].id).toBe(repeater.id)
    const off = makeToggleModifierCmd(moved, layer.id, repeater.id, false).execute(moved)
    expect(Object.keys(off.layers[0].spline!.subShapes)).toHaveLength(1)
    const removed = makeRemoveModifierCmd(off, layer.id, repeater.id).execute(off)
    expect(removed.layers[0].modifierStack!.modifiers).toHaveLength(3)
    const bake = makeBakeModifierStackCmd(removed, layer.id), baked = bake.execute(removed)
    expect(baked.layers[0].modifierStack).toBeUndefined(); expect(baked.layers[0].spline).toEqual(removed.layers[0].spline); expect(bake.undo(baked)).toEqual(removed)
    expect(() => makeExecuteModifierStackCmd(scene, layer.id, { [repeater.id]: { count: 1.5 } })).toThrow('integer')
    expect(scene.layers[0]).toBe(layer)
  })
  it.each(types)('%s refuses source locks atomically when its result changes a locked coordinate/record', type => {
    const { scene, layer } = fixture(); Object.values(layer.spline!.points)[0].locked = true
    const result = add(scene, type)
    if (type === 'splineRepeater') { expect(result.warning).toBeUndefined(); return }
    // Resample/Zig Zag pin exact source corners; unchanged locked pins are valid.
    if (['pathResample', 'zigZag'].includes(type) && !result.warning) expect(result.scene.layers[0].spline!.points[Object.keys(layer.spline!.points)[0]]).toEqual(Object.values(layer.spline!.points)[0])
    else { expect(result.warning).toContain('locked'); expect(result.scene.layers[0].spline).toEqual(layer.spline) }
  })
})

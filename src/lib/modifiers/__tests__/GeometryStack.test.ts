import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromData, cloneLayerForDuplicate, newTimeline } from '../../defaults'
import { createRectangleSpline } from '../../spline/primitives/createRectangleSpline'
import { computeSplineBounds } from '../../spline/geometry/computeSplineBounds'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { prepareGeometryConversion } from '../../editor/commands-geometry-conversion'
import { makeUpdateLayerCmd } from '../../editor/commands-layer'
import { prepareAddModifier, makeExecuteModifierStackCmd, makeMoveModifierCmd, makeRemoveModifierCmd,
  makeToggleModifierCmd, makeBakeModifierStackCmd, makeSetModifierSourceCmd } from '../../editor/modifiers/commands'
import { modifierStackService, projectModifierStacks, clearModifierGeometryCache, modifierGeometryCacheStatistics, geometryModifierRegistry } from '..'
import { defaultRuntimeSceneCompiler } from '../../export/runtime/RuntimeSceneCompiler'
import { materializeRenderScene } from '../../render/materializeOverrides'
import { editableSplineLayer } from '../../spline/edit/authoringGuard'
import { isLayerTimelineProperty } from '../../timeline/authoring/timelinePropertyScope'
import type { ChronoScene } from '../../types'

/** Axis-aligned local source; native modifier solvers and commands are real. */
function fixture(): ChronoScene {
  const layer = newSplineLayerFromData(createRectangleSpline({ width: 100, height: 80 }))
  return { ...emptyScene(), layers: [{ ...layer, id: 'source' }] }
}
function add(scene: ChronoScene, type = 'offset') {
  const plan = prepareAddModifier(scene, 'source', type)
  return { scene: plan.command.execute(scene), id: plan.modifierId, command: plan.command, warning: plan.warning }
}

describe('geometry stack integration', () => {
  it('applies new settings to the retained source, never accumulating old output', () => {
    const source = fixture(), original = structuredClone(source), first = add(source)
    expect(first.warning).toBeUndefined()
    expect(computeSplineBounds(first.scene.layers[0].spline!).width).toBeCloseTo(102)
    const command = makeExecuteModifierStackCmd(first.scene, 'source', { [first.id]: { distancePx: 10 } })
    const changed = command.execute(first.scene)
    expect(computeSplineBounds(changed.layers[0].spline!).width).toBeCloseTo(120)
    const changedAgain = makeExecuteModifierStackCmd(changed, 'source', { [first.id]: { distancePx: 20 } }).execute(changed)
    expect(computeSplineBounds(changedAgain.layers[0].spline!).width).toBeCloseTo(140)
    expect(changedAgain.layers[0].modifierStack!.source).toEqual({ kind: 'spline', spline: original.layers[0].spline })
    expect(source).toEqual(original)
    expect(command.undo(changed)).toBe(first.scene)
  })
  it('supports separate repeated instances, arbitrary removal, enable and reorder', () => {
    const one = add(fixture()), two = add(one.scene), three = add(two.scene)
    expect(new Set(three.scene.layers[0].modifierStack!.modifiers.map(item => item.id)).size).toBe(3)
    const removed = makeRemoveModifierCmd(three.scene, 'source', two.id).execute(three.scene)
    expect(removed.layers[0].modifierStack!.modifiers.map(item => item.id)).toEqual([one.id, three.id])
    expect(computeSplineBounds(removed.layers[0].spline!).width).toBeCloseTo(104)
    const off = makeToggleModifierCmd(removed, 'source', one.id, false).execute(removed)
    expect(computeSplineBounds(off.layers[0].spline!).width).toBeCloseTo(102)
    const moved = makeMoveModifierCmd(off, 'source', three.id, -1).execute(off)
    expect(moved.layers[0].modifierStack!.modifiers.map(item => item.id)).toEqual([three.id, one.id])
  })
  it('runs multiple pending settings atomically and refuses stale/invalid commands', () => {
    const one = add(fixture()), two = add(one.scene)
    const command = makeExecuteModifierStackCmd(two.scene, 'source', { [one.id]: { distancePx: 3 }, [two.id]: { distancePx: 4 } })
    const next = command.execute(two.scene)
    expect(computeSplineBounds(next.layers[0].spline!).width).toBeCloseTo(114)
    expect(() => command.execute({ ...two.scene })).toThrow(/Scene changed/)
    const before = JSON.stringify(two.scene)
    expect(() => makeExecuteModifierStackCmd(two.scene, 'source', { [one.id]: { distancePx: -1 } })).toThrow(/distancePx/)
    expect(JSON.stringify(two.scene)).toBe(before)
  })
  it.each(['outline', 'chamfer', 'fillet'])('executes %s via its own registered class and deterministic IDs', type => {
    const first = add(fixture(), type)
    expect(first.warning).toBeUndefined()
    const layer = first.scene.layers[0]
    const a = modifierStackService.execute(layer, layer.modifierStack!)
    const b = modifierStackService.execute(layer, layer.modifierStack!)
    expect(a.spline).toEqual(b.spline)
    expect(a.spline).not.toEqual(fixture().layers[0].spline)
    expect(geometryModifierRegistry.get(type).descriptor.category).toBe('spline')
  })
  it('keeps conversion inside the same stack and rejects incompatible removal/reorder', () => {
    const shape = { ...newRectLayer(), id: 'source' }, scene = { ...emptyScene(), layers: [shape] }
    const converted = prepareGeometryConversion(scene, ['source'], 'mesh2d').command.execute(scene)
    const layer = converted.layers[0], records = layer.modifierStack!.modifiers
    expect(records.map(item => item.type)).toEqual(['convertSpline', 'convertMesh2d'])
    expect(() => makeRemoveModifierCmd(converted, 'source', records[0].id)).toThrow(/requires spline/i)
    expect(() => makeMoveModifierCmd(converted, 'source', records[1].id, -1)).toThrow(/requires spline/i)
    const restored = makeRemoveModifierCmd(converted, 'source', records[1].id).execute(converted)
    expect(restored.layers[0].type).toBe('spline')
    expect(makeRemoveModifierCmd(restored, 'source', records[0].id).execute(restored).layers[0].type).toBe('shape')
  })
  it('preserves spline modifiers when converting their final result to Mesh', () => {
    const one = add(fixture()), converted = prepareGeometryConversion(one.scene, ['source'], 'mesh2d').command.execute(one.scene)
    expect(converted.layers[0].modifierStack!.modifiers.map(item => item.type)).toEqual(['offset', 'convertMesh2d'])
    const changed = makeExecuteModifierStackCmd(converted, 'source', { [one.id]: { distancePx: 10 } }).execute(converted)
    const xs = changed.layers[0].mesh2d!.geometry.positions.filter((_, i) => i % 2 === 0)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(120)
  })
  it('rejects generated point writes; disabling/Bake restore direct editing', () => {
    const one = add(fixture()), layer = one.scene.layers[0]
    expect(() => editableSplineLayer(one.scene, 'source')).toThrow(/generated/)
    expect(() => makeUpdateLayerCmd('source', { spline: fixture().layers[0].spline }, layer)).toThrow(/Disable geometry modifiers/)
    const disabled = makeToggleModifierCmd(one.scene, 'source', one.id, false).execute(one.scene)
    expect(editableSplineLayer(disabled, 'source').id).toBe('source')
    const baked = makeBakeModifierStackCmd(one.scene, 'source').execute(one.scene)
    expect(baked.layers[0].modifierStack).toBeUndefined()
    expect(baked.layers[0].spline).toEqual(layer.spline)
    expect(editableSplineLayer(baked, 'source').id).toBe('source')
  })
  it('captures direct converted point edits in the instance and rebuilds only explicitly', () => {
    const source = { ...emptyScene(), layers: [{ ...newRectLayer(), id: 'source' }] }
    const converted = prepareGeometryConversion(source, ['source'], 'spline').command.execute(source), layer = converted.layers[0]
    const spline = layer.spline!, id = Object.keys(spline.points)[0], edited = { ...spline, points: { ...spline.points, [id]: { ...spline.points[id], x: 7 } } }
    const changed = makeUpdateLayerCmd('source', { spline: edited }, layer).execute(converted)
    expect(projectModifierStacks(changed).layers[0].spline!.points[id].x).toBe(7)
    const rebuilt = makeSetModifierSourceCmd(changed, 'source', changed.layers[0].modifierStack!.source, true).execute(changed)
    expect(rebuilt.layers[0].spline!.points[id].x).toBe(spline.points[id].x)
  })
  it('round-trips source, clones independently, projects render and flattens runtime', () => {
    const one = add(fixture()), scene = parseSceneJson(JSON.stringify(one.scene), true), layer = scene.layers[0]
    expect(scene.layers[0].modifierStack).toEqual(one.scene.layers[0].modifierStack)
    const copy = cloneLayerForDuplicate(layer)
    expect(copy.modifierStack).toEqual(layer.modifierStack)
    expect(copy.modifierStack).not.toBe(layer.modifierStack)
    const projected = materializeRenderScene(scene, new Map())
    expect(projected.layers[0].spline).toEqual(layer.spline)
    const compiled = defaultRuntimeSceneCompiler.compile(scene)
    expect(compiled.layers[0].modifierStack).toBeUndefined()
    expect(compiled.layers[0].spline).toEqual(layer.spline)
    clearModifierGeometryCache(); projectModifierStacks(scene)
    expect(modifierGeometryCacheStatistics().entries).toBeGreaterThan(0)
    clearModifierGeometryCache(); expect(modifierGeometryCacheStatistics().entries).toBe(0)
  })
  it('retains transform/paint animation while refusing competing geometry/stack drivers', () => {
    const source = fixture(), timeline = newTimeline()
    timeline.tracks = [{ target: 'layers.source.transform.x', keyframes: [] }]
    const one = add({ ...source, timelines: [timeline] })
    expect(one.scene.timelines[0]).toBe(timeline)
    expect(isLayerTimelineProperty(one.scene.layers[0], 'transform.x')).toBe(true)
    expect(isLayerTimelineProperty(one.scene.layers[0], 'spline.points.a.x')).toBe(false)
    expect(isLayerTimelineProperty(one.scene.layers[0], 'modifierStack.modifiers.0.settings.distancePx')).toBe(false)
    const invalid = { ...source, timelines: [{ ...timeline, tracks: [{ target: 'layers.source.spline.points.a.x', keyframes: [] }] }] }
    expect(() => add(invalid)).toThrow(/geometry animation or live drivers/)
    const imported = { ...one.scene, timelines: invalid.timelines }
    expect(() => parseSceneJson(JSON.stringify(imported), true)).toThrow(/geometry animation or live drivers/)
  })
})

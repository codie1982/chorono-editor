import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData, cloneLayerForDuplicate } from '../../defaults'
import { createCircleSpline, createDonutSpline, createPolylineSpline, createRectangleSpline, mergeSplineData, splineToPathDefinition } from '../../spline'
import { divideSplineEdges } from '../../spline/topology'
import { setSplineObjectInterpolation } from '../../spline/edit/objectDetail'
import { computeSplineBounds } from '../../spline/geometry/computeSplineBounds'
import { prepareAddModifier, makeExecuteModifierStackCmd, makeToggleModifierCmd, makeMoveModifierCmd, makeRemoveModifierCmd, makeSetModifierSourceCmd, makeBakeModifierStackCmd } from '../../editor/modifiers/commands'
import { prepareGeometryConversion } from '../../editor/commands-geometry-conversion'
import { geometryModifierRegistry, modifierStackService, projectModifierStacks } from '..'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { defaultRuntimeSceneCompiler } from '../../export/runtime/RuntimeSceneCompiler'
import type { ChronoScene } from '../../types'

/** Real source and command pipeline, independent from UI/worker lifecycles. */
function fixture(data = createRectangleSpline({ width: 100, height: 80 })) {
  const layer = newSplineLayerFromData(data), scene = emptyScene(); scene.layers = [layer]
  layer.transform = { ...layer.transform, x: 150, y: 90, rotationDeg: 30, scaleX: 1.5, scaleY: .75, anchorX: 4 }
  return { scene, layer }
}
function add(scene: ChronoScene, type: string, selection?: Parameters<typeof prepareAddModifier>[3]) {
  const plan = prepareAddModifier(scene, scene.layers[0].id, type, selection)
  return { ...plan, scene: plan.command.execute(scene) }
}

describe('static spline modifier package', () => {
  it('registers the Phase 1 choices while preserving every legacy type/flag and default contract', () => {
    expect(geometryModifierRegistry.list().filter(d => d.category === 'spline' && d.addable && !d.legacySplineTool).map(d => d.type)).toEqual(['offsetPath', 'roundCorners', 'pathSimplify', 'pathSmoothing', 'pathResample', 'zigZag', 'puckerBloat', 'splineRepeater', 'strokeToPath'])
    for (const type of ['offset', 'outline', 'chamfer', 'fillet']) expect(geometryModifierRegistry.get(type).descriptor.legacySplineTool).toBe(true)
    const { scene, layer } = fixture(), old = add(scene, 'offset'), modern = add(scene, 'offsetPath'), objectId = Object.keys(layer.spline!.subShapes)[0]
    expect(old.scene.layers[0].spline!.subShapes[objectId]).toBeUndefined()
    expect(modern.scene.layers[0].spline!.subShapes[objectId]).toBeDefined()
    expect(splineToPathDefinition(modern.scene.layers[0].spline!)).toEqual(splineToPathDefinition(old.scene.layers[0].spline!))
  })
  it.each(['offsetPath', 'roundCorners', 'pathSimplify', 'pathSmoothing'])('%s is deterministic, immutable, portable and one exact Undo/Redo with the existing source/paint/TRS contracts', type => {
    const { scene, layer } = fixture(), before = structuredClone(scene), result = add(scene, type)
    expect(result.warning).toBeUndefined(); expect(result.scene.layers[0].transform).toEqual(layer.transform); expect(result.scene.layers[0].style).toEqual(layer.style)
    const stack = result.scene.layers[0].modifierStack!, a = modifierStackService.execute(result.scene.layers[0], stack), b = modifierStackService.execute(result.scene.layers[0], stack)
    expect(a.spline).toEqual(b.spline); expect(stack.source).toEqual({ kind: 'spline', spline: layer.spline })
    expect(parseSceneJson(JSON.stringify(result.scene), true).layers[0].modifierStack).toEqual(stack)
    const clone = cloneLayerForDuplicate(result.scene.layers[0]); expect(clone.modifierStack).toEqual(stack); expect(clone.modifierStack).not.toBe(stack)
    expect(projectModifierStacks(result.scene).layers[0].spline).toEqual(a.spline)
    const runtime = defaultRuntimeSceneCompiler.compile(result.scene); expect(runtime.layers[0].modifierStack).toBeUndefined(); expect(runtime.layers[0].spline).toEqual(a.spline)
    const undone = result.command.undo(result.scene); expect(undone).toEqual(before); expect(result.command.execute(undone)).toEqual(result.scene); expect(scene).toEqual(before)
  })
  it('modern Offset retains scoped Object identity/interpolation and unselected holes/objects through parameter changes', () => {
    const ring = createDonutSpline({ outerRadius: 40, innerRadius: 15 }), other = createRectangleSpline({ width: 10, height: 8 }), id = Object.keys(ring.subShapes)[0]
    const data = mergeSplineData(setSplineObjectInterpolation(ring, [id], .1), other), { scene, layer } = fixture(data)
    const first = add(scene, 'offsetPath', { contourIds: Object.keys(ring.contours) }), result = first.scene.layers[0].spline!
    expect(first.warning).toBeUndefined(); expect(result.subShapes[id].contourIds).toHaveLength(2); expect(result.subShapes[id].interpolation).toEqual({ version: 1, tolerancePx: .1 })
    for (const point of Object.values(other.points)) expect(result.points[point.id]).toEqual(point)
    const changed = makeExecuteModifierStackCmd(first.scene, layer.id, { [first.modifierId]: { distancePx: 5 } }).execute(first.scene)
    expect(changed.layers[0].spline!.subShapes[id].name).toBe(data.subShapes[id].name)
    expect(changed.layers[0].modifierStack!.source).toEqual({ kind: 'spline', spline: data })
  })
  it('Simplify re-evaluates original anchors at each tolerance, never accumulating prior simplification', () => {
    const data = createPolylineSpline(Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: Math.sin(i) * .1 })), false), { scene, layer } = fixture(data)
    const first = add(scene, 'pathSimplify'), coarse = first.scene.layers[0].spline!
    const fine = makeExecuteModifierStackCmd(first.scene, layer.id, { [first.modifierId]: { tolerancePx: .001 } }).execute(first.scene)
    expect(Object.keys(fine.layers[0].spline!.points).length).toBeGreaterThan(Object.keys(coarse.points).length)
    const coarseAgain = makeExecuteModifierStackCmd(fine, layer.id, { [first.modifierId]: { tolerancePx: .5 } }).execute(fine)
    expect(coarseAgain.layers[0].spline).toEqual(coarse)
    expect(first.scene.layers[0].modifierStack!.source).toEqual({ kind: 'spline', spline: data })
  })
  it('Object scope is captured from stage input and rejects missing/stale targets instead of expanding to all', () => {
    const ring = createDonutSpline({ outerRadius: 40, innerRadius: 15 }), rectangle = createRectangleSpline({ width: 20, height: 10 }), data = mergeSplineData(ring, rectangle), ids = Object.keys(ring.subShapes)
    const { scene, layer } = fixture(data), first = add(scene, 'pathSmoothing', { objectIds: ids }), result = first.scene.layers[0].spline!
    expect(first.warning).toBeUndefined()
    for (const point of Object.values(data.points)) { expect(result.points[point.id].x).toBe(point.x); expect(result.points[point.id].y).toBe(point.y) }
    for (const point of Object.values(rectangle.points)) expect(result.points[point.id]).toEqual(point)
    expect(() => makeExecuteModifierStackCmd(first.scene, layer.id, { [first.modifierId]: { objectIds: ['missing'] } })).toThrow('existing elements')
    const divided = divideSplineEdges(data, Object.keys(ring.segments), 2)
    expect(() => makeSetModifierSourceCmd(first.scene, layer.id, { kind: 'spline', spline: divided })).toThrow('Upstream topology')
    expect(first.scene.layers[0].spline).toEqual(result)
  })
  it('orders noncommuting operations, applies a settings batch once and supports arbitrary removal/toggle/Bake', () => {
    const { scene, layer } = fixture(), first = add(scene, 'offsetPath'), second = add(first.scene, 'roundCorners')
    expect(second.warning).toBeUndefined()
    const moved = makeMoveModifierCmd(second.scene, layer.id, second.modifierId, -1).execute(second.scene)
    expect(moved.layers[0].spline).not.toEqual(second.scene.layers[0].spline)
    const executed = makeExecuteModifierStackCmd(second.scene, layer.id, { [first.modifierId]: { distancePx: 3 }, [second.modifierId]: { radiusPx: 2 } })
    const changed = executed.execute(second.scene); expect(computeSplineBounds(changed.layers[0].spline!).width).toBeCloseTo(106)
    expect(executed.undo(changed)).toEqual(second.scene)
    const removed = makeRemoveModifierCmd(changed, layer.id, first.modifierId).execute(changed)
    expect(removed.layers[0].modifierStack!.modifiers.map(record => record.type)).toEqual(['roundCorners'])
    const off = makeToggleModifierCmd(removed, layer.id, second.modifierId, false).execute(removed)
    expect(off.layers[0].spline).toEqual(layer.spline)
    const baked = makeBakeModifierStackCmd(changed, layer.id).execute(changed)
    expect(baked.layers[0].modifierStack).toBeUndefined(); expect(baked.layers[0].spline).toEqual(changed.layers[0].spline)
  })
  it('adds unsupported defaults disabled, then refuses invalid activation/late source authority atomically', () => {
    const { scene, layer } = fixture(createCircleSpline({ radius: 30 })), first = add(scene, 'roundCorners')
    expect(first.warning).toContain('No sharp'); expect(first.scene.layers[0].modifierStack!.modifiers[0].enabled).toBe(false)
    expect(() => makeToggleModifierCmd(first.scene, layer.id, first.modifierId, true)).toThrow('No sharp')
    const offset = add(scene, 'offsetPath'), command = makeExecuteModifierStackCmd(offset.scene, layer.id, { [offset.modifierId]: { distancePx: 2 } })
    expect(() => command.execute({ ...offset.scene })).toThrow('Scene changed')
    expect(() => makeExecuteModifierStackCmd(offset.scene, layer.id, { [offset.modifierId]: { distancePx: -1 } })).toThrow('distancePx')
  })
  it('keeps modern spline stages when converting their result into a valid Mesh', () => {
    const first = add(fixture().scene, 'roundCorners'), id = first.scene.layers[0].id
    const converted = prepareGeometryConversion(first.scene, [id], 'mesh2d').command.execute(first.scene)
    expect(converted.layers[0].modifierStack!.modifiers.map(record => record.type)).toEqual(['roundCorners', 'convertMesh2d'])
    expect(converted.layers[0].mesh2d!.geometry.topology.triangleIndices.length).toBeGreaterThan(0)
  })
  it('replaces baked corner radii through Execute with stable recipes, exact history and preserved source/paint/TRS', () => {
    const original = fixture(), rounded = add(original.scene, 'roundCorners')
    const baked = makeBakeModifierStackCmd(rounded.scene, original.layer.id).execute(rounded.scene), before = structuredClone(baked)
    const added = add(baked, 'roundCorners')
    expect(added.warning).toBeUndefined()
    expect(added.scene.layers[0].modifierStack!.modifiers[0].enabled).toBe(true)
    for (const radiusPx of [20, .5, 12]) {
      const command = makeExecuteModifierStackCmd(added.scene, original.layer.id, { [added.modifierId]: { radiusPx } }), result = command.execute(added.scene)
      expect(result.layers[0].modifierStack!.source).toEqual({ kind: 'spline', spline: baked.layers[0].spline })
      expect(result.layers[0].transform).toEqual(original.layer.transform); expect(result.layers[0].style).toEqual(original.layer.style)
      expect(command.undo(result)).toBe(added.scene)
      expect(command.execute(added.scene)).toEqual(result)
      const reloaded = parseSceneJson(JSON.stringify(result), true)
      expect(projectModifierStacks(reloaded).layers[0].spline).toEqual(result.layers[0].spline)
    }
    expect(baked).toEqual(before)
    const legacy = add(baked, 'fillet')
    expect(legacy.warning).toContain('No sharp'); expect(legacy.scene.layers[0].spline).toEqual(baked.layers[0].spline)
  })
  it.each(['offsetPath', 'pathSimplify', 'pathSmoothing'])('%s keeps native point locks when its result would change/remove a locked record', type => {
    const data = createPolylineSpline([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], false)
    data.points[Object.values(data.contours)[0].pointIds[1]].locked = true
    const { scene, layer } = fixture(data), first = add(scene, type)
    expect(first.warning).toContain('locked'); expect(first.scene.layers[0].modifierStack!.modifiers[0].enabled).toBe(false)
    expect(first.scene.layers[0].spline).toEqual(layer.spline)
    expect(() => makeToggleModifierCmd(first.scene, layer.id, first.modifierId, true)).toThrow('locked')
  })
  it('modern Object scope keeps unselected locked geometry intact while legacy Offset retains its old policy', () => {
    const rectangle = createRectangleSpline({ width: 20, height: 10 }), path = createPolylineSpline([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }], false)
    const lockedId = Object.keys(rectangle.points)[0]; rectangle.points[lockedId].locked = true
    const data = mergeSplineData(rectangle, path), first = add(fixture(data).scene, 'pathSimplify', { objectIds: Object.keys(path.subShapes) })
    expect(first.warning).toBeUndefined(); expect(first.scene.layers[0].spline!.points[lockedId]).toEqual(rectangle.points[lockedId])
    const legacy = add(fixture(rectangle).scene, 'offset'); expect(legacy.warning).toBeUndefined()
  })
})

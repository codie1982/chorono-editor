import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromData, cloneLayerForDuplicate } from '../../defaults'
import { createPolylineSpline, createCircleSpline, createDonutSpline, createRectangleSpline, mergeSplineData, splineToPathDefinition } from '../../spline'
import { modifierStackService, projectModifierLayer, modifierOutputReadOnly } from '..'
import { prepareAddModifier, makeExecuteModifierStackCmd, makeToggleModifierCmd, makeBakeModifierStackCmd, makeMoveModifierCmd } from '../../editor/modifiers/commands'
import { makeUpdateLayerCmd } from '../../editor/commands-layer'
import { splineEditCommand } from '../../editor/spline/editCommand'
import { insertPointOnSegment } from '../../spline/edit/mutations'
import { deleteSplineObjects } from '../../spline/topology/objects'
import { prepareLiveSplineOutline } from '../../editor/spline/band/liveOutlinePlan'
import { defaultBandDraft } from '../../spline/band/settingsFields'
import { SplineBandBackend } from '../../spline/band/SplineBandBackend'
import { computeSplineBounds } from '../../spline/geometry/computeSplineBounds'
import { editableSplineLayer } from '../../spline/edit/authoringGuard'
import { defaultRuntimeSceneCompiler } from '../../export/runtime/RuntimeSceneCompiler'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { exportSVG } from '../../export/vector/SVGExporter'
import { withSplineObjectPaint, splinePaintTargets } from '../../spline/paint/objectPaint'
import { prepareGeometryConversion } from '../../editor/commands-geometry-conversion'
import type { SplinePathData } from '../../types/spline'

const line = () => createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false)
function fixture(data: SplinePathData = line()) {
  const scene = emptyScene(), layer = newSplineLayerFromData(data); scene.layers = [layer]
  layer.transform = { ...layer.transform, x: 170, y: 120, rotationDeg: 23, scaleX: 1.5, scaleY: .7, anchorX: 8 }
  return { scene, layer }
}
function live(f = fixture(), scope?: string[]) {
  const plan = prepareAddModifier(f.scene, f.layer.id, 'liveOutline', scope ? { objectIds: scope } : undefined)
  expect(plan.warning).toBeUndefined()
  const scene = plan.command.execute(f.scene)
  return { scene, layer: scene.layers[0], plan, original: f }
}
describe('live Outline source/evaluated ownership', () => {
  it('retains original points, handles, edges and Object identities while rendering a real band', () => {
    const { scene, layer, original, plan } = live(), visual = projectModifierLayer(layer, true)
    expect(layer.spline).toEqual(original.layer.spline); expect(layer.spline).toBe(layer.modifierStack!.source.kind === 'spline' ? layer.modifierStack!.source.spline : null)
    expect(scene.layers).toHaveLength(1); expect(Object.keys(layer.spline!.subShapes)).toHaveLength(1)
    expect(Object.keys(visual.spline!.subShapes)).toEqual(Object.keys(layer.spline!.subShapes))
    expect(computeSplineBounds(visual.spline!).height).toBeCloseTo(10)
    expect(visual.spline).not.toEqual(layer.spline); expect(modifierOutputReadOnly(layer)).toBe(false)
    expect(editableSplineLayer(scene, layer.id).spline).toBe(layer.spline)
    expect(layer.transform).toEqual(original.layer.transform); expect(layer.style).toEqual(original.layer.style)
    expect(plan.command.undo(scene)).toBe(original.scene)
  })
  it('updates the band after independent source moves, preserving exact Undo/Redo and origin', () => {
    const result = live(), data = result.layer.spline!, id = Object.keys(data.points)[1]
    const move = splineEditCommand(result.scene, result.layer.id, { kind: 'point', ids: [id] }, d => ({ ...d, points: { ...d.points, [id]: { ...d.points[id], y: 40 } } }))!
    const moved = move.execute(result.scene), after = moved.layers[0]
    expect(after.spline!.points[id].y).toBe(40); expect(after.transform).toEqual(result.layer.transform)
    expect(projectModifierLayer(after, true).spline).not.toEqual(projectModifierLayer(result.layer, true).spline)
    expect(Object.keys(after.spline!.points)).toEqual(Object.keys(data.points))
    const undo = move.undo(moved); expect(undo).toEqual(result.scene); expect(move.execute(undo)).toEqual(moved)
  })
  it('tracks Refine and point deletion within stable Object scope without stale topology signatures', () => {
    const source = fixture(createRectangleSpline({ width: 100, height: 80 })), result = live(source, Object.keys(source.layer.spline!.subShapes))
    expect(result.layer.modifierStack!.modifiers[0].settings.selectionTopology).toBeUndefined()
    const edge = Object.keys(result.layer.spline!.segments)[0]
    const add = splineEditCommand(result.scene, result.layer.id, { kind: 'topology' }, d => insertPointOnSegment(d, edge, .5))!
    const refined = add.execute(result.scene)
    expect(Object.keys(refined.layers[0].spline!.points)).toHaveLength(5)
    expect(projectModifierLayer(refined.layers[0], true).hidden).not.toBe(true)
    const deleted = splineEditCommand(refined, result.layer.id, { kind: 'topology' }, d => deleteSplineObjects(d, Object.keys(d.subShapes)))!.execute(refined)
    expect(Object.keys(projectModifierLayer(deleted.layers[0], true).spline!.points)).toHaveLength(0)
  })
  it('exposes converted Shape source overrides, not generated band points', () => {
    const scene = emptyScene(), shape = newRectLayer(); shape.size = { width: 100, height: 80 }; scene.layers = [shape]
    const converted = prepareGeometryConversion(scene, [shape.id], 'spline').command.execute(scene), result = live({ scene: converted, layer: converted.layers[0] })
    const id = Object.keys(result.layer.spline!.points)[0], next = { ...result.layer.spline!, points: { ...result.layer.spline!.points, [id]: { ...result.layer.spline!.points[id], x: 9 } } }
    const edited = makeUpdateLayerCmd(result.layer.id, { spline: next }, result.layer).execute(result.scene)
    expect(edited.layers[0].spline!.points[id].x).toBe(9)
    expect(edited.layers[0].modifierStack!.source.kind).toBe('shape')
    expect(edited.layers[0].modifierStack!.modifiers[0].settings.edited).toEqual(next)
  })
  it('keeps unrelated Objects untouched and maps requested targets in source order', () => {
    const a = createRectangleSpline({ width: 100, height: 80 }), b = createCircleSpline({ radius: 20 }), data = mergeSplineData(a, b)
    const result = live(fixture(data), [Object.keys(b.subShapes)[0], Object.keys(a.subShapes)[0]])
    const visual = projectModifierLayer(result.layer, true)
    expect(computeSplineBounds({ ...visual.spline!, subShapes: { [Object.keys(b.subShapes)[0]]: visual.spline!.subShapes[Object.keys(b.subShapes)[0]] } }).width).toBeCloseTo(50, 0)
    const partial = live(fixture(data), Object.keys(a.subShapes)), projected = projectModifierLayer(partial.layer, true)
    for (const p of Object.values(b.points)) expect(projected.spline!.points[p.id]).toEqual(p)
  })
  it('keeps source editable when Off and materializes boundaries only on explicit Bake', () => {
    const result = live(), id = result.plan.modifierId
    const off = makeToggleModifierCmd(result.scene, result.layer.id, id, false).execute(result.scene)
    expect(off.layers[0].spline).toEqual(result.layer.spline); expect(projectModifierLayer(off.layers[0], true).spline).toEqual(result.layer.spline)
    const on = makeToggleModifierCmd(off, result.layer.id, id, true).execute(off)
    const bake = makeBakeModifierStackCmd(on, result.layer.id), baked = bake.execute(on)
    expect(baked.layers[0].modifierStack).toBeUndefined(); expect(baked.layers[0].spline).toEqual(projectModifierLayer(on.layers[0], true).spline)
    expect(baked.layers[0].spline).not.toEqual(on.layers[0].spline); expect(bake.undo(baked)).toBe(on)
  })
  it('does not grant arbitrary generated stacks point editing, even when Outline is added', () => {
    const first = live(), added = prepareAddModifier(first.scene, first.layer.id, 'pathResample').command.execute(first.scene)
    expect(modifierOutputReadOnly(added.layers[0])).toBe(true)
    expect(() => editableSplineLayer(added, first.layer.id)).toThrow(/generated/)
    expect(() => prepareAddModifier(first.scene, first.layer.id, 'liveOutline')).toThrow(/already/)
    const move = makeMoveModifierCmd(added, first.layer.id, first.plan.modifierId, 1).execute(added)
    expect(modifierOutputReadOnly(move.layers[0])).toBe(true)
  })
  it('persists source and paint across portable/clone/runtime/SVG, retaining delimited holes', () => {
    const result = live(fixture(createDonutSpline({ outerRadius: 60, innerRadius: 25 }))), id = Object.keys(result.layer.spline!.subShapes)[0]
    expect(splinePaintTargets(result.layer).map(o => o.id)).toEqual([id])
    const painted = makeUpdateLayerCmd(result.layer.id, withSplineObjectPaint(result.layer, id, { fill: { type: 'solid', color: '#ee7700' } }), result.layer).execute(result.scene)
    expect(parseSceneJson(JSON.stringify(painted), true)).toEqual(painted)
    expect(cloneLayerForDuplicate(painted.layers[0]).modifierStack).toEqual(painted.layers[0].modifierStack)
    const visual = projectModifierLayer(painted.layers[0], true)
    expect(Object.values(visual.spline!.contours)).toHaveLength(4)
    expect(defaultRuntimeSceneCompiler.compile(painted).layers[0].spline).toEqual(visual.spline)
    expect(exportSVG(painted).svg).toContain('fill="#ee7700"')
    expect(painted.layers[0].spline).toEqual(result.layer.spline)
  })
  it('keeps source locks and geometry-driver admission while allowing non-destructive band evaluation', () => {
    const source = fixture(), point = Object.keys(source.layer.spline!.points)[0]
    source.layer.spline!.points[point].locked = true
    const result = live(source)
    expect(result.layer.spline!.points[point].locked).toBe(true)
    expect(() => splineEditCommand(result.scene, result.layer.id, { kind: 'point', ids: [point] }, d => d)).toThrow(/Unlock/)
    const driven = fixture(), id = Object.keys(driven.layer.spline!.points)[0]
    driven.layer.paramBindings = { [`spline.points.${id}.x`]: 'driver' }
    expect(() => prepareAddModifier(driven.scene, driven.layer.id, 'liveOutline')).toThrow(/drivers|geometry animation/)
  })
  it('rejects stale serialized authoring snapshots and preserves real external-reference guards', () => {
    const result = live()
    const stale = structuredClone(result.scene), point = Object.keys(stale.layers[0].spline!.points)[0]
    stale.layers[0].spline = structuredClone(stale.layers[0].spline!)
    stale.layers[0].spline!.points[point].x += 1
    expect(() => parseSceneJson(JSON.stringify(stale), true)).toThrow(/editable input source/)
    const external = { ...result.scene, parameters: [{ id: 'reader', name: 'Reader', type: 'string' as const, defaultValue: `layers.${result.layer.id}.spline.points.${point}.x` }] }
    expect(() => splineEditCommand(external, result.layer.id, { kind: 'topology' }, d => deleteSplineObjects(d, Object.keys(d.subShapes)))).toThrow(/reference/)
  })
  it('native preview/Apply saves a recipe and reuses it; rejects partial chains without modifying source', () => {
    const source = fixture(), ids = Object.keys(source.layer.spline!.subShapes)
    const preview = prepareLiveSplineOutline(source.scene, source.layer.id, 'object', ids, defaultBandDraft())
    const apply = preview.command(new SplineBandBackend().compute(preview.request)), applied = apply.command.execute(source.scene)
    expect(apply.ids).toEqual(ids); expect(applied.layers[0].spline).toEqual(source.layer.spline)
    const again = prepareLiveSplineOutline(applied, source.layer.id, 'object', ids, { ...defaultBandDraft(), widthPx: 20 })
    const updated = again.command(new SplineBandBackend().compute(again.request)).command.execute(applied)
    expect(updated.layers[0].modifierStack!.modifiers).toHaveLength(1)
    expect(computeSplineBounds(projectModifierLayer(updated.layers[0], true).spline!).height).toBeCloseTo(20)
    const rect = fixture(createRectangleSpline({ width: 100, height: 80 }))
    expect(() => prepareLiveSplineOutline(rect.scene, rect.layer.id, 'edge', [Object.keys(rect.layer.spline!.segments)[0]], defaultBandDraft())).toThrow(/every edge|partial-chain/)
  })
})

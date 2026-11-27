import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData, cloneLayerForDuplicate } from '../../defaults'
import { createRectangleSpline, createDonutSpline, createPolylineSpline, mergeSplineData } from '../index'
import { prepareSplineBand } from '../../editor/spline/band/bandPlan'
import { SplineBandBackend } from './SplineBandBackend'
import { defaultBandSettings } from './types'
import { prepareAddModifier, makeExecuteModifierStackCmd, makeToggleModifierCmd, makeBakeModifierStackCmd } from '../../editor/modifiers/commands'
import { modifierStackService } from '../../modifiers'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { defaultRuntimeSceneCompiler } from '../../export/runtime/RuntimeSceneCompiler'
import { makeUpdateLayerCmd } from '../../editor/commands-layer'
import { splinePaintGroups, withSplineObjectPaint } from '../paint/objectPaint'
import { layerPaintAssetIds } from '../../paint/paintSource'
import { exportSVG } from '../../export/vector/SVGExporter'
import type { SplinePathData } from '../../types/spline'
function fixture(data: SplinePathData = createRectangleSpline({ width: 100, height: 80 })) {
  const scene = emptyScene(), layer = newSplineLayerFromData(data)
  scene.layers = [layer]; layer.transform = { ...layer.transform, x: 250, y: 200, rotationDeg: 23, scaleX: 1.7, scaleY: .6, anchorX: 7 }
  return { scene, layer }
}
function native(source = fixture(), keep = false) {
  const { scene, layer } = source, plan = prepareSplineBand(scene, layer.id, 'object', Object.keys(layer.spline!.subShapes), defaultBandSettings, keep)
  const preview = new SplineBandBackend().compute(plan.request), command = plan.command(preview).command
  return { command, scene: command.execute(scene), original: source }
}
describe('native and stack Outline integration', () => {
  it('applies local geometry once, preserving placement, origin, source paint and exact Undo/Redo', () => {
    const source = fixture(), before = structuredClone(source.scene), applied = native(source)
    expect(source.scene).toEqual(before)
    expect(applied.scene.layers[0].transform).toEqual(source.layer.transform)
    expect(applied.scene.layers[0].style).toEqual(source.layer.style)
    expect(applied.scene.layers[0].modifierStack).toBeUndefined()
    expect(applied.command.undo(applied.scene)).toEqual(source.scene)
    expect(applied.command.execute(applied.command.undo(applied.scene))).toEqual(applied.scene)
    expect(() => applied.command.execute({ ...source.scene })).toThrow(/changed/)
  })
  it('refuses locked or animated removed geometry without changing source', () => {
    const source = fixture(); Object.values(source.layer.spline!.points)[0].locked = true
    expect(() => native(source)).toThrow(/Unlock|locked/)
    const driven = fixture(), point = Object.keys(driven.layer.spline!.points)[0]
    driven.scene.timelines = [{ id: 'timeline', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: `layers.${driven.layer.id}.spline.points.${point}.x`, keyframes: [{ id: 'key', timeMs: 0, value: 1, easing: { type: 'linear' } }] }] }]
    expect(() => native(driven)).toThrow(/driven|animation|keyed/i)
  })
  it('builds a normal modern modifier, stable output and ordered Execute, toggle, Bake with exact history', () => {
    const { scene, layer } = fixture(), add = prepareAddModifier(scene, layer.id, 'strokeToPath'), first = add.command.execute(scene)
    expect(add.warning).toBeUndefined(); const stack = first.layers[0].modifierStack!
    expect(stack.source).toEqual({ kind: 'spline', spline: layer.spline })
    expect(modifierStackService.execute(first.layers[0], stack)).toEqual(first.layers[0])
    const edit = makeExecuteModifierStackCmd(first, layer.id, { [add.modifierId]: { widthPx: 20, alignment: 'outside' } }), wider = edit.execute(first)
    expect(wider.layers[0].spline).not.toEqual(first.layers[0].spline); expect(edit.undo(wider)).toBe(first)
    const off = makeToggleModifierCmd(wider, layer.id, add.modifierId, false).execute(wider); expect(off.layers[0].spline).toEqual(layer.spline)
    const bake = makeBakeModifierStackCmd(wider, layer.id), baked = bake.execute(wider)
    expect(baked.layers[0].modifierStack).toBeUndefined(); expect(baked.layers[0].spline).toEqual(wider.layers[0].spline); expect(bake.undo(baked)).toBe(wider)
  })
  it('preserves custom band appearance across Execute, load, clone and runtime compilation', () => {
    const { scene, layer } = fixture(), add = prepareAddModifier(scene, layer.id, 'strokeToPath'), added = add.command.execute(scene), output = added.layers[0]
    const object = Object.values(output.spline!.subShapes)[0]
    const painted = makeUpdateLayerCmd(layer.id, withSplineObjectPaint(output, object.id, { fill: { type: 'solid', color: '#ff7700' } }), output).execute(added)
    const changed = makeExecuteModifierStackCmd(painted, layer.id, { [add.modifierId]: { widthPx: 12 } }).execute(painted)
    expect(changed.layers[0].spline!.subShapes[object.id].paint!.style).toEqual(painted.layers[0].splinePaintOverrides!.objects[object.id])
    expect(parseSceneJson(JSON.stringify(changed), true).layers[0]).toEqual(changed.layers[0])
    expect(cloneLayerForDuplicate(changed.layers[0]).spline).toEqual(changed.layers[0].spline)
    expect(defaultRuntimeSceneCompiler.compile(changed).layers[0].spline).toEqual(changed.layers[0].spline)
  })
  it('retains generated paint through disabling/re-enabling and permits explicit return to source stroke', () => {
    const { scene, layer } = fixture(), add = prepareAddModifier(scene, layer.id, 'strokeToPath'), added = add.command.execute(scene)
    const objectId = Object.keys(added.layers[0].spline!.subShapes)[0]
    const painted = makeUpdateLayerCmd(layer.id, withSplineObjectPaint(added.layers[0], objectId, { fill: { type: 'solid', color: '#ff7700' } }), added.layers[0]).execute(added)
    const off = makeToggleModifierCmd(painted, layer.id, add.modifierId, false).execute(painted)
    const on = makeToggleModifierCmd(off, layer.id, add.modifierId, true).execute(off)
    expect(on.layers[0].spline!.subShapes[objectId].paint!.style!.fill!.color).toBe('#ff7700')
    const reset = makeUpdateLayerCmd(layer.id, withSplineObjectPaint(on.layers[0], objectId, null), on.layers[0]).execute(on)
    expect(splinePaintGroups(reset.layers[0])[0].layer.style!.fill!.color).toBe(layer.style!.stroke!.color)
    const rebuilt = modifierStackService.execute(reset.layers[0], reset.layers[0].modifierStack!)
    expect(rebuilt.spline!.subShapes[objectId].paint).toEqual({ version: 1, source: 'stroke' })
  })
  it('renders source and band through distinct paint groups; SVG is actual fill geometry with holes', () => {
    const result = native(fixture(createDonutSpline({ outerRadius: 60, innerRadius: 25 })), true), layer = result.scene.layers[0]
    layer.style = { fill: { type: 'none' }, stroke: { type: 'gradient', color: '#000000', width: 3, gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#00ff00' }] } } }
    const groups = splinePaintGroups(layer)
    expect(groups).toHaveLength(2); expect(groups[0].layer.style!.fill!.type).toBe('none')
    expect(groups[1].layer.style!.fill!.gradient).toEqual(layer.style.stroke!.gradient); expect(groups[1].layer.style!.stroke!.type).toBe('none')
    const svg = exportSVG(result.scene, { timeMs: 0 }).svg
    expect(svg).toContain('linearGradient'); expect(svg).toContain(`fill-rule="${layer.spline!.fillRule}"`); expect(svg.match(/<path\b[^>]*>/g)!.at(-1)).not.toMatch(/stroke=/)
  })
  it('independent pattern paint participates in image demand and portable validation', () => {
    const result = native(), layer = result.scene.layers[0], object = Object.values(layer.spline!.subShapes)[0]
    object.paint = { version: 1, source: 'custom', style: { fill: { type: 'image', image: { version: 1, assetId: 'pattern-image', repeat: true } } } }
    expect(layerPaintAssetIds(layer)).toEqual(['pattern-image'])
    expect(parseSceneJson(JSON.stringify(result.scene), true).layers[0].spline!.subShapes[object.id].paint).toEqual(object.paint)
    object.paint.version = 2 as 1
    expect(() => parseSceneJson(JSON.stringify(result.scene), true)).toThrow(/paint/)
  })
  it('accepts open chains and multiple Objects without implicit source-wide selection', () => {
    const a = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false), b = createRectangleSpline({ width: 10, height: 10 })
    const source = fixture(mergeSplineData(a, b)), plan = prepareSplineBand(source.scene, source.layer.id, 'object', Object.keys(a.subShapes), defaultBandSettings)
    const result = plan.command(new SplineBandBackend().compute(plan.request)).command.execute(source.scene)
    expect(result.layers[0].spline!.subShapes[Object.keys(b.subShapes)[0]]).toEqual(Object.values(b.subShapes)[0])
  })
})

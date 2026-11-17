import { RuntimeOptimizer } from '../../export/RuntimeOptimizer'
import { exportToRuntime } from '../../export/runtimeExport'
import { exportHTML } from '../../export/html/htmlExport'
import { translateSplineData } from '../../spline'
import { describe, it, expect } from 'vitest'
import { emptyScene, newRectLayer, newTimeline, newSplineLayerFromData } from '../../defaults'
import type { ChronoScene } from '../../types'
import { prepareBooleanOperation } from './operationPlan'
import { PolygonClippingBackend } from '../../geometry/boolean'
import { projectBooleanOperations, flattenBooleanOperationsForOutput } from '../../booleanOperations/projectOperations'
import { assertSceneBooleanOperations } from '../../booleanOperations/validation'
import { clearBooleanGeometryCache, booleanGeometryCacheStatistics } from '../../booleanOperations/evaluateOperation'
import { resolveLayerWorldBounds } from '../../geometry/resolveLayerWorldBounds'
import { makeCloneForestCmd } from '../commands-clone-forest'
import { makeAddKfCmd } from '../commands-keyframe'
import { makeUpdateLayerCmd, makeDeleteLayerCmd } from '../commands-layer'
import { executeAuthoredCommand } from '../authoring/AuthoringCommand'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { exportSVG } from '../../export/vector/SVGExporter'
import { createRectangleSpline, createDonutSpline, mergeSplineData } from '../../spline'

/** Fixed source fixture makes loss of IDs/manual keys/stacking observable. */
export function operationFixture(): ChronoScene {
  const scene = emptyScene(), a = { ...newRectLayer(), id: 'a' }, b = { ...newRectLayer(), id: 'b' }
  a.transform = { ...a.transform, x: 10, y: 20, anchorX: 0, anchorY: 0 }; a.size = { width: 80, height: 80 }
  b.transform = { ...a.transform, x: 50 }; b.size = { width: 80, height: 80 }
  scene.layers = [a, b]; scene.timelines = [{ ...newTimeline(), id: 'main', layerIds: ['a', 'b'], tracks: [] }]; return scene
}
/** Real solver output is intentionally not stored in the resulting source. */
function apply(scene: ChronoScene, operation: 'union' | 'subtract' | 'intersect' = 'union') {
  const plan = prepareBooleanOperation(scene, [{ layerId: 'a', label: 'A' }, { layerId: 'b', label: 'B' }], { operation, reverse: false, tolerancePx: .25 }, 0, new Map())
  const result = new PolygonClippingBackend().compute(plan.request), command = plan.command(result)
  return { plan, result, command, next: command.execute(scene) }
}
describe('persisted Boolean operation', () => {
  it.each(['union', 'subtract', 'intersect'] as const)('keeps exact sources, save/open, one inverse and shared bounds for %s', operation => {
    const scene = operationFixture(), before = structuredClone(scene), { next, command, plan, result } = apply(scene, operation)
    expect(scene).toEqual(before); expect(command.undo(next)).toBe(scene); expect(command.execute(command.undo(next))).toEqual(next)
    for (const original of scene.layers) expect(next.layers.find(layer => layer.id === original.id)).toEqual({ ...original, parentId: plan.ownerId })
    const owner = next.layers.find(layer => layer.id === plan.ownerId)!, output = next.layers.find(layer => layer.id === owner.booleanOperation!.resultLayerId)!
    expect(output.spline!.points).toEqual({}); expect(next.timelines).toBe(scene.timelines)
    const parsed = parseSceneJson(JSON.stringify(next)); expect(parsed.layers).toEqual(next.layers)
    clearBooleanGeometryCache()
    const projected = projectBooleanOperations(parsed), generated = projected.layers.find(layer => layer.id === output.id)!
    expect(Object.keys(generated.spline!.points)).toHaveLength(result.outputVertices)
    expect(resolveLayerWorldBounds(output, parsed, 0, new Map())).toEqual(resolveLayerWorldBounds(generated, projected, 0, new Map()))
    const svg = exportSVG(parsed); expect(svg.svg).toContain('<path'); expect(svg.svg).not.toContain('booleanOperation')
    const flat = flattenBooleanOperationsForOutput(parsed); expect(flat.layers.map(layer => layer.id)).toEqual([owner.id, output.id]); expect(flat.timelines[0].layerIds).toEqual([])
    expect(flat.layers.some(layer => layer.booleanOperation || layer.booleanResultFor)).toBe(false)
    for (const output of [new RuntimeOptimizer().optimize(parsed), exportToRuntime(parsed)]) { expect(output.layers.map(layer => layer.id)).toEqual([owner.id, output.layers[1].id]); expect(output.layers.some(layer => layer.id === 'a' || layer.booleanOperation)).toBe(false) }
    expect(exportHTML(parsed).html).not.toContain('booleanOperation')
  })
  it('retains parent animation; static edits invalidate geometry and output can animate normally', () => {
    const scene = operationFixture(), parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
    parent.transform.rotationDeg = 27; parent.transform.scaleX = 1.7
    scene.layers.forEach(layer => { layer.parentId = 'parent' }); scene.layers.unshift(parent)
    scene.timelines[0].tracks = [{ target: 'layers.parent.transform.x', keyframes: [{ id: 'manual', timeMs: 0, value: 33, easing: { type: 'linear' } }] }]
    const { next, plan } = apply(scene); expect(next.timelines).toBe(scene.timelines)
    const owner = next.layers.find(layer => layer.id === plan.ownerId)!, output = owner.booleanOperation!.resultLayerId
    const first = projectBooleanOperations(next).layers.find(layer => layer.id === output)!.spline
    const source = next.layers.find(layer => layer.id === 'b')!
    const edited = executeAuthoredCommand(makeUpdateLayerCmd('b', { transform: { ...source.transform, x: 70 } }, source), next)
    expect(projectBooleanOperations(edited).layers.find(layer => layer.id === output)!.spline).not.toEqual(first)
    const key = { id: 'outer', timeMs: 100, value: 12, easing: { type: 'linear' as const } }
    expect(() => executeAuthoredCommand(makeAddKfCmd('main', `layers.${output}.transform.x`, key), next)).not.toThrow()
    expect(() => makeAddKfCmd('main', 'layers.a.transform.x', key).execute(next)).toThrow(/Boolean inputs/)
    expect(() => makeAddKfCmd('main', `layers.${output}.spline.points.any.x`, key).execute(next)).toThrow()
  })
  it('rejects animated inputs, external readers, partial deletion and topology writers without publishing', () => {
    const scene = operationFixture(); scene.timelines[0].tracks = [{ target: 'layers.a.transform.x', keyframes: [] }]
    expect(() => apply(scene)).toThrow(/animated/); scene.timelines[0].tracks = []
    scene.layers.push({ ...newRectLayer(), id: 'reader', instanceOf: 'a' }); expect(() => apply(scene)).toThrow(/external/); scene.layers.pop()
    const { next } = apply(scene), output = next.layers.find(layer => layer.booleanResultFor)!
    expect(() => executeAuthoredCommand(makeDeleteLayerCmd(next.layers.find(layer => layer.id === 'a')!), next)).toThrow(/missing/)
    expect(() => executeAuthoredCommand(makeUpdateLayerCmd(output.id, { spline: createRectangleSpline({ width: 20, height: 20 }) }, output), next)).toThrow(/placeholder/)
    const corrupt = structuredClone(next); corrupt.layers.find(layer => layer.booleanOperation)!.booleanOperation!.version = 99 as 1
    expect(() => parseSceneJson(JSON.stringify(corrupt))).toThrow(/recipe/)
    const cyclic = structuredClone(next); cyclic.layers.find(layer => layer.booleanOperation)!.parentId = 'a'
    expect(() => parseSceneJson(JSON.stringify(cyclic))).toThrow(/cyclic/)
    const singular = structuredClone(next); singular.layers.find(layer => layer.booleanOperation)!.booleanOperation!.sampling = [0, 0, 0, 0]
    expect(() => assertSceneBooleanOperations(singular)).toThrow(/recipe/)
  })
  it('edits only the recipe and rejects stale completion', () => {
    const scene = operationFixture(), { next, plan } = apply(scene)
    const edit = prepareBooleanOperation(next, [], { operation: 'subtract', reverse: true, tolerancePx: .1 }, 0, new Map(), plan.ownerId)
    const command = edit.command(new PolygonClippingBackend().compute(edit.request))
    expect(() => command.execute({ ...next })).toThrow(/changed/)
    const changed = command.execute(next); expect(changed.layers.filter(layer => layer.id !== plan.ownerId)).toEqual(next.layers.filter(layer => layer.id !== plan.ownerId))
    expect(command.undo(changed)).toBe(next); expect(changed.timelines).toBe(next.timelines)
  })
  it('copies the whole operation with retargeted ownership and refuses partial/linked copies', () => {
    const { next, plan } = apply(operationFixture())
    const command = makeCloneForestCmd(next, { sourceIds: [plan.ownerId], mode: 'copy' }), copied = command.execute(next)
    assertSceneBooleanOperations(copied)
    const clone = copied.layers.find(layer => layer.booleanOperation && layer.id !== plan.ownerId)!
    expect(clone.booleanOperation!.inputs.every(input => input.layerId !== 'a' && input.layerId !== 'b')).toBe(true)
    expect(projectBooleanOperations(copied).layers.filter(layer => layer.booleanResultFor).every(layer => Object.keys(layer.spline!.points).length > 0)).toBe(true)
    expect(() => makeCloneForestCmd(next, { sourceIds: ['a'] })).toThrow(/complete/)
    expect(() => makeCloneForestCmd(next, { sourceIds: [plan.ownerId], mode: 'instance' })).toThrow(/independent/)
    expect(() => assertSceneBooleanOperations({ ...next, layers: [...next.layers, { ...newRectLayer(), id: 'unsupported_instance', instanceOf: plan.ownerId }] })).toThrow(/linked Instance/)
    const overBudget = makeCloneForestCmd(next, { sourceIds: [plan.ownerId], count: 64 })
    expect(() => executeAuthoredCommand(overBudget, next)).toThrow(/64 operations/)
    expect(next.layers).toHaveLength(4)
  })
  it('keeps unconsumed Objects and holes; empty results and bounded cache are valid', () => {
    const scene = operationFixture(), data = mergeSplineData(mergeSplineData(createDonutSpline({ outerRadius: 40, innerRadius: 15 }), translateSplineData(createRectangleSpline({ width: 10, height: 10 }), 120, 0)), translateSplineData(createRectangleSpline({ width: 20, height: 15 }), 180, 0))
    scene.layers = [newSplineLayerFromData(data, { x: 0, y: 0 })]; const layer = scene.layers[0], ids = Object.keys(data.subShapes)
    // Use two Objects from one source; both are consumed, with donut hole preserved in a distant union.
    const plan = prepareBooleanOperation(scene, ids.slice(0, 2).map(subShapeId => ({ layerId: layer.id, subShapeId, label: subShapeId })), { operation: 'union', reverse: false, tolerancePx: .25 }, 0, new Map())
    const result = new PolygonClippingBackend().compute(plan.request), next = plan.command(result).execute(scene)
    const remaining = projectBooleanOperations(next).layers.find(item => item.id === layer.id)!.spline!
    expect(Object.keys(remaining.subShapes)).toEqual([ids[2]]); expect(remaining.subShapes[ids[2]]).toEqual(data.subShapes[ids[2]])
    expect(result.holes).toBe(1)
    expect(flattenBooleanOperationsForOutput(next).layers.find(item => item.id === layer.id)!.spline).toEqual(remaining)
    clearBooleanGeometryCache(); for (let i = 0; i < 12; i++) projectBooleanOperations(apply(operationFixture(), i % 2 ? 'union' : 'intersect').next)
    expect(booleanGeometryCacheStatistics().entries).toBeLessThanOrEqual(8); expect(booleanGeometryCacheStatistics().bytes).toBeLessThanOrEqual(16 * 1024 ** 2)
    const empty = operationFixture(); empty.layers[1].transform.x = 500
    const { next: noArea } = apply(empty, 'intersect'); expect(Object.keys(projectBooleanOperations(noArea).layers.find(item => item.booleanResultFor)!.spline!.points)).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import '../../registry/bootstrap'
import { emptyScene, newRectLayer } from '../../defaults'
import type { ChronoScene, ParameterRef, ParameterWire } from '../../types'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { assertScenePropertyExpressions, type PropertyExpression } from './PropertyExpression'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { ExpressionProgramCache } from '../../core/expression/ExpressionProgramCache'
import { executeAuthoredCommand } from '../../editor/authoring/AuthoringCommand'
import { makeUpdateLayerCmd } from '../../editor/commands-layer'
import { dependencyOrder } from '../../core/graph/dependencyOrder'
import { makeSetPropertyExpressionCmd, makeRemovePropertyExpressionCmd } from '../../editor/inputExpressions/PropertyExpressionCommand'
import { makeSessionProject, readSessionProject } from '../../editor/session/SessionProject'
import { exportToRuntime } from '../../export/runtimeExport'
import { defaultRuntimeExporter } from '../../export/RuntimeExporter'
import { exportSVG } from '../../export/vector/SVGExporter'

/** Production source/evaluation fixture. No parser, graph or renderer mocks. */
function fixture(): ChronoScene {
  const scene = emptyScene()
  scene.layers = ['a', 'b', 'c'].map(id => ({ ...newRectLayer(), id, name: id }))
  scene.composition.durationMs = 2000
  scene.timelines = [{ id: 'motion', durationMs: 2000, autoplay: true, loop: false, tracks: [] }]
  return scene
}
/** Stable scalar refs are shared with existing Wire authoring. */
function ref(layerId: string, propertyPath = 'size.width'): ParameterRef { return { layerId, propertyPath, valueType: 'number' } }
/** Create an explicit local-clock definition; source units remain numeric. */
function definition(formula: string, sources: Record<string, ParameterRef> = {}): PropertyExpression { return { resultType: 'number', formula, timelineId: 'motion', sources } }
/** Attach a portable driver directly for malformed/import/conflict scenarios. */
function live(scene: ChronoScene, id: string, path: string, formula: string, sources: Record<string, ParameterRef> = {}) {
  const layer = scene.layers.find(item => item.id === id)!
  layer.propertyExpressions = { version: 1, fields: { ...layer.propertyExpressions?.fields, [path]: definition(formula, sources) } }
}
/** Legacy Wire defaults keep its existing pre-wire snapshot policy. */
function wire(id: string, source: ParameterRef, target: ParameterRef, expression = 'source*2'): ParameterWire {
  return { id, source, target, expression, enabled: true, blendMode: 'override', createdAt: 0, updatedAt: 0 }
}

describe('live numeric property expressions', () => {
  it('uses explicit local ms/sec/normalized clocks, loop mapping and authoring overrides without touching source', () => {
    const scene = fixture(); live(scene, 'a', 'size.width', 'timeMs + timeSec + timeNormalized')
    const before = JSON.stringify(scene)
    expect(evaluateSceneFrame(scene, 500).overrides.get('layers.a.size.width')).toBe(500.75)
    expect(evaluateSceneFrame(scene, 9000, { externalTime: { timelineId: 'motion', localTimeMs: 250 } }).overrides.get('layers.a.size.width')).toBe(250.375)
    const looping = { ...scene, timelines: [{ ...scene.timelines[0], loop: true }] }
    expect(evaluateSceneFrame(looping, 2500).overrides.get('layers.a.size.width')).toBe(500.75)
    expect(JSON.stringify(scene)).toBe(before)
  })
  it('orders named multi-source drivers independently of layer order and uses actual runtime parameters', () => {
    const scene = fixture()
    scene.parameters = [{ id: 'amount', name: 'Amount', type: 'number', defaultValue: 10 }]
    live(scene, 'a', 'size.width', 'other*2 + own', { other: ref('b'), own: ref('a', 'size.height') })
    live(scene, 'b', 'size.width', 'amount + timeSec', { amount: { propertyPath: 'amount', valueType: 'number' } })
    expect(evaluateSceneFrame(scene, 500).overrides.get('layers.a.size.width')).toBe(101)
    expect(evaluateSceneFrame(scene, 500, { paramValues: new Map([['amount', 20]]) }).overrides.get('layers.a.size.width')).toBe(121)
  })
  it('supports expression → legacy Wire → expression while preserving old Wire → Wire semantics', () => {
    const scene = fixture()
    live(scene, 'a', 'size.width', 'timeMs+1')
    live(scene, 'c', 'opacity', 'value/1000', { value: ref('b') })
    scene.parameterWires = [wire('bridge', ref('a'), ref('b'))]
    expect(evaluateSceneFrame(scene, 100).overrides.get('layers.c.opacity')).toBe(.202)
    const old = fixture(); old.parameterWires = [wire('first', ref('a'), ref('b')), wire('second', ref('b'), ref('c'), 'source*3')]
    expect(evaluateSceneFrame(old, 100).overrides.get('layers.c.size.width')).toBe(480)
    const extended = structuredClone(old); live(extended, 'a', 'opacity', '0.5')
    expect(evaluateSceneFrame(extended, 100).overrides.get('layers.c.size.width')).toBe(480)
  })
  it('blocks joint cycles and their dependents with pre-driver fallback', () => {
    const scene = fixture()
    live(scene, 'a', 'size.width', 'value+1', { value: ref('b') })
    live(scene, 'c', 'size.width', 'value+1', { value: ref('a') })
    scene.parameterWires = [wire('reverse', ref('a'), ref('b'))]
    const frame = evaluateSceneFrame(scene, 0)
    expect(frame.overrides.size).toBe(0)
    expect(frame.expressionErrors.size).toBe(2)
    expect(frame.cycleWireIds.has('reverse')).toBe(true)
  })
  it('reads Wire-written parameter outputs in new expressions without changing legacy parameter-source reads', () => {
    const scene = fixture(); scene.parameters = [{ id: 'p', name: 'P', type: 'number', defaultValue: 5 }]
    const parameter = { propertyPath: 'p', valueType: 'number' as const }
    live(scene, 'a', 'size.width', 'amount+1', { amount: parameter })
    scene.parameterWires = [wire('to-param', ref('b'), parameter), wire('legacy-from-param', parameter, ref('c'))]
    const frame = evaluateSceneFrame(scene, 0)
    expect(frame.overrides.get('layers.a.size.width')).toBe(321)
    expect(frame.overrides.get('layers.c.size.width')).toBe(10)
  })
  it('propagates runtime/missing-source/type/bounds failures without writing NaN or stale dependent values', () => {
    const scene = fixture(); live(scene, 'a', 'size.width', '1/0')
    live(scene, 'b', 'size.width', 'value+1', { value: ref('a') })
    live(scene, 'c', 'opacity', '2')
    const frame = evaluateSceneFrame(scene, 0)
    expect(frame.overrides.size).toBe(0); expect(frame.expressionErrors.size).toBe(3)
    const missing = fixture(); live(missing, 'a', 'size.width', 'value', { value: ref('deleted') })
    expect(evaluateSceneFrame(missing, 0).expressionErrors.get('layers.a.size.width')).toMatch(/no finite/)
    missing.parameters = [{ id: 'bool', name: 'Bool', type: 'boolean', defaultValue: true }]
    missing.layers[0].propertyExpressions!.fields['size.width'].sources.value = { propertyPath: 'bool', valueType: 'number' }
    expect(evaluateSceneFrame({ ...missing }, 0).expressionErrors.get('layers.a.size.width')).toMatch(/numeric/)
  })
  it('keeps keyed channels and manually edited fallback source; editor-only lock does not pause a valid driver', () => {
    const scene = fixture(); live(scene, 'a', 'size.width', '999')
    scene.timelines[0].tracks = [{ target: 'layers.a.size.width', keyframes: [{ id: 'human', timeMs: 0, value: 288, easing: { type: 'linear' } }] }]
    const frame = evaluateSceneFrame(scene, 0)
    expect(frame.overrides.get('layers.a.size.width')).toBe(288)
    expect(frame.expressionErrors.get('layers.a.size.width')).toMatch(/existing animation/)
    const unlocked = fixture(); live(unlocked, 'a', 'size.width', '200'); unlocked.layers[0].locked = true
    expect(evaluateSceneFrame(unlocked, 0).overrides.get('layers.a.size.width')).toBe(200)
    expect(unlocked.layers[0].size?.width).toBe(160)
  })
  it('commits/removes/converts atomically, preserves fallback and rejects stale or invalid review frames', () => {
    const scene = fixture(), command = makeSetPropertyExpressionCmd(scene, 'a', 'size.width', definition('100+timeSec*20'), { timeMs: 500 })
    const next = command.execute(scene)
    expect(next.layers[0].size?.width).toBe(160)
    expect(evaluateSceneFrame(next, 500).overrides.get('layers.a.size.width')).toBe(110)
    expect(command.undo(next)).toBe(scene)
    expect(() => command.execute({ ...scene })).toThrow(/Source changed/)
    expect(() => makeSetPropertyExpressionCmd(scene, 'a', 'size.width', definition('1/0')).execute(scene)).toThrow(/zero/)
    const removed = makeRemovePropertyExpressionCmd(next, 'a', 'size.width').execute(next)
    const converted = makeRemovePropertyExpressionCmd(next, 'a', 'size.width', { timeMs: 500 }).execute(next)
    expect(removed.layers[0].size?.width).toBe(160); expect(converted.layers[0].size?.width).toBe(110)
    expect(converted.layers[0].propertyExpressions).toBeUndefined()
  })
  it('round-trips formula/refs/history without executing saved expressions and publishes explicit exporter capabilities', () => {
    const scene = fixture(), next = makeSetPropertyExpressionCmd(scene, 'a', 'size.width', definition('100+timeSec*20')).execute(scene)
    const saved = makeSessionProject({ present: next, past: [scene], future: [] }, 'expr-session')
    const opened = readSessionProject(parseSceneJson(JSON.stringify(saved), true))
    expect(opened.history.past[0].layers[0].propertyExpressions).toBeUndefined()
    expect(opened.history.present.layers[0].propertyExpressions).toEqual(next.layers[0].propertyExpressions)
    const runtime = defaultRuntimeExporter.export(next)
    expect(runtime.runtime.layers[0].propertyExpressions).toEqual(next.layers[0].propertyExpressions)
    expect(runtime.warnings.some(item => item.code === 'REQUIRES_LIVE_EXPRESSIONS')).toBe(true)
    expect(() => exportToRuntime(next)).toThrow(/Bake/)
    expect(() => exportSVG(next, { animated: true })).toThrow(/Bake/)
    const malformedFormula = structuredClone(next); malformedFormula.layers[0].propertyExpressions!.fields['size.width'].formula = 'not_a_variable'
    expect(() => parseSceneJson(JSON.stringify(malformedFormula))).not.toThrow()
    expect(evaluateSceneFrame(malformedFormula, 0).expressionErrors.size).toBe(1)
  })
  it('bounds program ownership and validates source envelopes, reserved names and total graph size', () => {
    const cache = new ExpressionProgramCache(2), first = cache.get('1')
    cache.get('2'); expect(cache.get('1')).toBe(first); cache.get('3'); expect(cache.size).toBe(2)
    cache.clear(); expect(cache.size).toBe(0)
    const scene = fixture(); live(scene, 'a', 'size.width', '1', { timeSec: ref('b') })
    expect(() => assertScenePropertyExpressions(scene)).toThrow(/reserved/)
    const huge = fixture(); huge.layers = Array.from({ length: 513 }, (_, index) => ({ ...newRectLayer(), id: 'many-' + index, propertyExpressions: { version: 1 as const, fields: { 'size.width': definition('1') } } }))
    expect(() => assertScenePropertyExpressions(huge)).toThrow(/512/)
  })
  it('rejects malformed raw/script patches at the shared authored commit boundary', () => {
    const scene = fixture(), invalid = definition('input')
    invalid.sources = { timeSec: ref('b') }
    const patch = makeUpdateLayerCmd('a', { propertyExpressions: { version: 1, fields: { 'size.width': invalid } } }, scene.layers[0])
    expect(() => executeAuthoredCommand(patch, scene)).toThrow(/reserved/)
    expect(scene.layers[0].propertyExpressions).toBeUndefined()
  })
  it('shares stable duplicate-edge/cycle ordering with the Wire validator', () => {
    const graph = dependencyOrder(['island'], [['a', 'b'], ['a', 'b'], ['b', 'c'], ['x', 'y'], ['y', 'x'], ['y', 'z']] as const)
    expect(graph.order).toEqual(['island', 'a', 'b', 'c'])
    expect(Array.from(graph.blocked)).toEqual(['x', 'y', 'z'])
  })
})

import { describe, expect, it } from 'vitest'
import '../../registry/bootstrap'
import { emptyScene, newRectLayer, cloneLayerForDuplicate } from '../../defaults'
import { inspectNumericFormula, inspectNumericLiteral, assertNumericInputExpressions } from './NumericInputExpression'
import { makeNumericExpressionCommand, numericExpressionBlock } from './NumericExpressionCommand'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import { writePropertyPath } from '../../scene/properties/writePropertyPath'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { exportToRuntime } from '../../export/runtimeExport'
import { defaultRuntimeOptimizer } from '../../export/RuntimeOptimizer'
import { makeSessionProject, readSessionProject } from '../session/SessionProject'
import { executeAuthoredCommand } from '../authoring'
import { initHistory, pushHistory, undoHistory, redoHistory } from '../history'

/** Native source fixture; parser/commands/render source values are production
 * implementations. No mock formula evaluator or generated code execution. */
function fixture() { const scene = emptyScene(); scene.layers = [{ ...newRectLayer(), id: 'hero' }]; return scene }

describe('numeric input authoring', () => {
  it.each(['10+20', '10px', 'Infinity', '1e999', '', ' ', 'NaN', '--2'])('rejects partial/nonfinite numeric literal %j', value => {
    expect(inspectNumericLiteral(value).value).toBeNull()
  })
  it('accepts decimal/scientific numbers and rejects field bounds without clamping', () => {
    expect(inspectNumericLiteral(' -1.5e2 ').value).toBe(-150)
    expect(inspectNumericLiteral('1.1', { max: 1 }).error).toBe('Maximum is 1.')
    expect(inspectNumericLiteral('-1', { min: 0 }).value).toBeNull()
  })
  it('uses the shared finite, bounded whitelist language with explicit constants', () => {
    expect(inspectNumericFormula('1920 / 2').value).toBe(960)
    expect(inspectNumericFormula('sin(pi/2) + 2^-2').value).toBe(1.25)
    for (const expression of ['1/0', 'sqrt(-1)', 'timeSec*2', 'source+1', 'Math.random()', 'window.location', '1'.repeat(4097)]) expect(inspectNumericFormula(expression).error).toBeTruthy()
  })
  it('commits formula and numeric value together, preserving unrelated source and exact undo/redo attribution', () => {
    const before = fixture(), command = makeNumericExpressionCommand(before, 'hero', 'size.width', '1920 / 2')
    const next = executeAuthoredCommand(command, before)
    expect(next.layers[0].size?.width).toBe(960)
    expect(next.layers[0].inputExpressions?.fields['size.width']).toEqual({ formula: '1920 / 2', value: 960 })
    expect(next.layers[0].transform).toBe(before.layers[0].transform)
    expect(before.layers[0].size?.width).toBe(160)
    const history = pushHistory(initHistory(before), next), undone = undoHistory(history)
    expect(undone.present).toBe(before); expect(redoHistory(undone).present).toBe(next)
    expect(command.undo(next)).toBe(before)
  })
  it('opens saved formulas and pending history without re-evaluating or mutating the project', () => {
    const before = fixture(), present = makeNumericExpressionCommand(before, 'hero', 'size.width', '2^9').execute(before)
    const project = makeSessionProject({ present, past: [before], future: [] }, 'formula-session')
    const opened = readSessionProject(parseSceneJson(JSON.stringify(project), true))
    expect(opened.sessionId).toBe('formula-session'); expect(opened.history.present.layers[0].inputExpressions?.fields['size.width'].formula).toBe('2^9')
    expect(opened.history.past[0].layers[0].inputExpressions).toBeUndefined()
  })
  it('preserves numeric runtime/render source values while stripping editor recipes in both runtime exporters', () => {
    const before = fixture(), present = makeNumericExpressionCommand(before, 'hero', 'size.width', '200*3').execute(before)
    for (const layers of [exportToRuntime(present).layers, defaultRuntimeOptimizer.optimize(present).layers]) {
      expect(layers[0].size?.width).toBe(600); expect(layers[0]).not.toHaveProperty('inputExpressions')
    }
    expect(present.layers[0].inputExpressions).toBeDefined()
  })
  it('copies recipe data independently and preserves manually changed source on Convert to value', () => {
    const before = fixture(), source = makeNumericExpressionCommand(before, 'hero', 'size.width', '150*2').execute(before)
    const clone = cloneLayerForDuplicate(source.layers[0]); clone.inputExpressions!.fields['size.width'].formula = '400'
    expect(source.layers[0].inputExpressions?.fields['size.width'].formula).toBe('150*2')
    const changed = { ...source, layers: [{ ...source.layers[0], size: { ...source.layers[0].size!, width: 375 } }] }
    const converted = makeNumericExpressionCommand(changed, 'hero', 'size.width', null).execute(changed)
    expect(converted.layers[0].size?.width).toBe(375); expect(converted.layers[0].inputExpressions).toBeUndefined()
  })
  it('refuses stale source, invalid formula and incompatible property types atomically', () => {
    const before = fixture(), command = makeNumericExpressionCommand(before, 'hero', 'size.width', '600')
    expect(() => command.execute({ ...before })).toThrow(/Source changed/)
    expect(() => makeNumericExpressionCommand(before, 'hero', 'opacity', '2').execute(before)).toThrow(/Maximum/)
    expect(() => makeNumericExpressionCommand(before, 'hero', 'id', '2').execute(before)).toThrow(/target/)
    expect(() => makeNumericExpressionCommand(before, 'hero', 'style.fill.color', '2').execute(before)).toThrow(/numeric/)
    expect(() => makeNumericExpressionCommand(before, 'hero', 'size.width', '1/0').execute(before)).toThrow(/zero/)
    expect(before.layers[0].inputExpressions).toBeUndefined()
  })
  it('preserves animated channels and wire/binding/path drivers across every timeline', () => {
    const scene = fixture(), layer = scene.layers[0]
    scene.timelines = [{ id: 'inactive', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: 'layers.hero.transform.x', keyframes: [{ id: 'manual', timeMs: 0, value: 42, easing: { type: 'linear' } }] }] }]
    expect(numericExpressionBlock(scene, layer, 'transform.x')).toMatch(/animated/)
    expect(() => makeNumericExpressionCommand(scene, 'hero', 'transform.x', '2').execute(scene)).toThrow(/animated/)
    layer.paramBindings = { 'size.width': 'width-parameter' }
    expect(numericExpressionBlock(scene, layer, 'size.width')).toMatch(/binding/)
    expect(scene.timelines[0].tracks[0].keyframes[0].value).toBe(42)
  })
  it('validates versioned recipes and rejects prototype access even behind a missing parent', () => {
    const scene = fixture(), layer = scene.layers[0]
    layer.inputExpressions = { version: 1, fields: { 'missing.__proto__.polluted': { formula: '1', value: 1 } } }
    expect(() => assertNumericInputExpressions(layer)).toThrow(/Unsafe/)
    expect(() => parseSceneJson(JSON.stringify(scene))).toThrow(/Unsafe/)
    expect(() => readPropertyPath({}, 'missing.constructor')).toThrow(/Unsafe/)
    expect(() => writePropertyPath({}, 'missing.__proto__.polluted', 1, true)).toThrow(/Unsafe/)
  })
  it('writes existing array entries without changing topology and keeps schema creation explicit', () => {
    const source = { stops: [{ offset: 0 }, { offset: 1 }] }, updated = writePropertyPath(source, 'stops.1.offset', .75)
    expect(updated.stops).toHaveLength(2); expect(Array.isArray(updated.stops)).toBe(true)
    expect(updated.stops[0]).toBe(source.stops[0]); expect(source.stops[1].offset).toBe(1)
    expect(() => writePropertyPath(source, 'stops.5.offset', 2, true)).toThrow(/index/)
    expect(() => writePropertyPath({}, 'new.value', 2)).toThrow(/Missing/)
    expect(writePropertyPath({}, 'new.value', 2, true)).toEqual({ new: { value: 2 } })
  })
})

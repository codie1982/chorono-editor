import { describe, expect, it } from 'vitest'
import '../../registry/bootstrap'
import { emptyScene, newTextLayer, newRectLayer } from '../../defaults'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { makeSetPropertyExpressionCmd, makeRemovePropertyExpressionCmd } from '../../editor/inputExpressions/PropertyExpressionCommand'
import { prepareRenderFrame } from '../../render/prepareRenderFrame'
import { exportSVG } from '../../export/vector/SVGExporter'
import { ChronoPlayer } from '../../player/ChronoPlayer'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { makeCloneForestCmd } from '../../editor/commands-clone-forest'
import { evaluateParameterWiresVerbose } from '../../runtime/parameterWireEvaluator'
import { preparePropertyExpressionBake } from './preparePropertyExpressionBake'
import { propertyExpressionConstraints } from './PropertyExpressionCapability'
import { MAPPING_PRESETS } from '../../../components/wiring/presets'
import { evaluateWireExpression } from '../../wiring/WireExpression'
import type { ParameterWire } from '../../types'

/** Real source/schema adapters; no booleans are represented as numeric 0/1. */
function fixture() {
  const scene = emptyScene(), layer = { ...newTextLayer(), id: 'label' }
  layer.text = { ...layer.text!, value: 'Chorono', color: '#000000' }
  scene.layers = [layer, { ...newRectLayer(), id: 'rect' }]
  scene.timelines = [{ id: 'motion', durationMs: 1000, loop: false, autoplay: true, tracks: [] }]
  scene.parameters = [{ id: 'gate', name: 'Gate', type: 'boolean', defaultValue: true }]
  return scene
}
function wire(expression: string, booleanTarget = false): ParameterWire {
  return { id: 'wire', source: { propertyPath: 'gate', valueType: 'boolean' }, target: { layerId: 'label', propertyPath: booleanTarget ? 'text.uppercase' : 'opacity', valueType: booleanTarget ? 'boolean' : 'number' }, expression, enabled: true, blendMode: 'override', createdAt: 0, updatedAt: 0 }
}

describe('boolean property driver and compatibility adapters', () => {
  it('shares actual boolean frames with SDK, raster materialization and SVG; keeps authored fallback and Undo', () => {
    const source = fixture(), cmd = makeSetPropertyExpressionCmd(source, 'label', 'text.uppercase', { resultType: 'boolean', formula: 'gate && timeMs>=500', timelineId: 'motion', sources: { gate: { propertyPath: 'gate', valueType: 'boolean' } } }), scene = cmd.execute(source)
    const player = new ChronoPlayer(scene)
    for (const timeMs of [0, 500, 1000]) {
      const expected = timeMs >= 500
      expect(evaluateSceneFrame(scene, timeMs).overrides.get('layers.label.text.uppercase')).toBe(expected)
      expect(player.tick(timeMs).overrides.get('layers.label.text.uppercase')).toBe(expected)
      expect(prepareRenderFrame(scene, timeMs).scene.layers[0].text?.uppercase).toBe(expected)
      expect(exportSVG(scene, { timeMs }).svg).toContain('>' + (expected ? 'CHORONO' : 'Chorono') + '</text>')
    }
    expect(scene.layers[0].text?.uppercase).toBeUndefined(); expect(cmd.undo(scene)).toBe(source)
    expect(evaluateSceneFrame(scene, 500, { timelineWeights: new Map([['motion', .5]]) }).overrides.get('layers.label.text.uppercase')).toBe(false)
    const converted = makeRemovePropertyExpressionCmd(scene, 'label', 'text.uppercase', { timeMs: 500 }).execute(scene)
    expect(converted.layers[0].text?.uppercase).toBe(true); expect(converted.layers[0].propertyExpressions).toBeUndefined()
    const portable = parseSceneJson(JSON.stringify(scene))
    expect(evaluateSceneFrame(portable, 500).overrides.get('layers.label.text.uppercase')).toBe(true)
    const clone = makeCloneForestCmd(scene, { sourceIds: ['label'] }), copied = clone.execute(scene)
    expect(evaluateSceneFrame(copied, 500).overrides.get('layers.' + clone.idMaps[0].label + '.text.uppercase')).toBe(true)
    expect(() => preparePropertyExpressionBake(scene, 'label', 'text.uppercase', { startMs: 0, endMs: 1000, fps: 30, tolerance: 0 })).toThrow(/numeric results only/)
  })
  it('rejects numeric truthiness/type conflicts, preserves fallback and applies exact boolean source types', () => {
    const source = fixture()
    expect(() => makeSetPropertyExpressionCmd(source, 'label', 'text.uppercase', { resultType: 'boolean', formula: '1', timelineId: 'motion', sources: {} }).execute(source)).toThrow(/return boolean/)
    expect(() => propertyExpressionConstraints(source.layers[1], 'size.width', 'boolean')).toThrow(/not supported/)
    const cmd = makeSetPropertyExpressionCmd(source, 'label', 'text.underline', { resultType: 'boolean', formula: 'timeMs<500 ? true : 1', timelineId: 'motion', sources: {} }), scene = cmd.execute(source)
    expect(exportSVG(scene, { timeMs: 0 }).svg).toContain('text-decoration="underline"')
    const invalid = evaluateSceneFrame(scene, 500)
    expect(invalid.overrides.has('layers.label.text.underline')).toBe(false); expect(invalid.expressionErrors.get('layers.label.text.underline')).toMatch(/return boolean/)
    expect(exportSVG(scene, { timeMs: 500 }).svg).not.toContain('text-decoration="underline"')
    const skipped = makeSetPropertyExpressionCmd(source, 'label', 'text.uppercase', { resultType: 'boolean', formula: 'true || missing', timelineId: 'motion', sources: { missing: { layerId: 'deleted', propertyPath: 'text.uppercase', valueType: 'boolean' } } }).execute(source)
    expect(evaluateSceneFrame(skipped, 0).overrides.get('layers.label.text.uppercase')).toBe(true)
    const defaulted = makeSetPropertyExpressionCmd(source, 'label', 'text.uppercase', { resultType: 'boolean', formula: '!underline', timelineId: 'motion', sources: { underline: { layerId: 'label', propertyPath: 'text.underline', valueType: 'boolean' } } }).execute(source)
    expect(evaluateSceneFrame(defaulted, 0).overrides.get('layers.label.text.uppercase')).toBe(true)
  })
  it('evaluates every Boolean preset and saved numeric ternary predicate through the explicit Wire compatibility adapter', () => {
    for (const preset of MAPPING_PRESETS.filter(preset => preset.category === 'Boolean')) {
      expect(typeof evaluateWireExpression(wire(preset.expression), 1)).toBe('number')
      expect(typeof evaluateWireExpression(wire(preset.expression), 0)).toBe('number')
    }
    expect(evaluateWireExpression(wire('source ? 1.2 : 1'), 1)).toBe(1.2)
    expect(evaluateWireExpression(wire('source ? 1.2 : 1'), 0)).toBe(1)
    const source = fixture(), before = new Map(), params = new Map([['gate', true]])
    const frame = evaluateParameterWiresVerbose([wire('source!=0', true)], before, params, source)
    expect(frame.overrides.get('layers.label.text.uppercase')).toBe(true); expect(frame.runtimeErrorIds.size).toBe(0)
    const fromLayer = { ...wire('source', false), source: { layerId: 'label', propertyPath: 'text.uppercase', valueType: 'boolean' as const } }
    source.layers[0].text!.uppercase = false
    expect(evaluateParameterWiresVerbose([fromLayer], before, params, source).overrides.get('layers.label.opacity')).toBe(0)
    expect(() => evaluateWireExpression(wire('source!=0'), 1)).toThrow(/Numeric Wire target/)
  })
})

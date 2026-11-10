import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newParameterWire } from '../defaults'
import { inspectWire } from './WirePreview'
import { evaluateParameterWiresVerbose } from '../runtime/parameterWireEvaluator'
import { blockedWireIds } from './WireValidation'

function fixture() {
  const scene = emptyScene(), layer = { ...newRectLayer(), id: 'hero' }
  layer.transform.x = 10; scene.layers = [layer]
  const wire = newParameterWire({ id: 'wire', source: { layerId: 'hero', propertyPath: 'transform.x', valueType: 'number' },
    target: { layerId: 'hero', propertyPath: 'transform.y', valueType: 'number' }, expression: 'source*2+3' })
  return { scene, wire }
}
describe('wire preview and runtime share input/error behavior', () => {
  it('uses evaluated pre-wire source, both aliases and identical clamping without source writes', () => {
    const { scene, wire } = fixture(), before = JSON.stringify(scene), frame = new Map([['layers.hero.transform.x', 50]])
    wire.expression = 'source+s+3'; wire.clamp = { enabled: true, max: 90 }
    const preview = inspectWire(wire, scene, frame)
    expect(preview).toMatchObject({ source: 50, value: 90, error: null })
    expect(evaluateParameterWiresVerbose([wire], frame, new Map(), scene).overrides.get('layers.hero.transform.y')).toBe(90)
    expect(JSON.stringify(scene)).toBe(before)
  })
  it.each(['1/source', 'sqrt(-1)', 'sin()', 'unknown(source)', '1e309'])('keeps the input frame at %s failure', expression => {
    const { scene, wire } = fixture(); wire.expression = expression
    const frame = new Map([['layers.hero.transform.x', 0], ['layers.hero.transform.y', 905]])
    expect(inspectWire(wire, scene, frame).error).toBeTruthy()
    const result = evaluateParameterWiresVerbose([wire], frame, new Map(), scene)
    expect(result.overrides).toBe(frame); expect(result.errors.has(wire.id)).toBe(true)
  })
  it('reports missing source/target, invalid clamps and graph cycles including downstream wires', () => {
    const { scene, wire } = fixture()
    expect(inspectWire({ ...wire, source: { ...wire.source, layerId: 'missing' } }, scene).error).toContain('Source')
    expect(inspectWire({ ...wire, clamp: { enabled: true, min: 100, max: 1 } }, scene).error).toContain('Clamp')
    const reverse = { ...wire, id: 'reverse', source: wire.target, target: wire.source }
    const downstream = { ...wire, id: 'dependent', source: wire.target, target: { ...wire.target, propertyPath: 'opacity' } }
    scene.parameterWires = [reverse, downstream]
    expect(blockedWireIds([wire, reverse, downstream]).size).toBe(3)
    expect(inspectWire(wire, scene).error).toContain('cycle')
    const frame = new Map([['layers.hero.transform.x', 50]])
    expect(evaluateParameterWiresVerbose([wire, reverse, downstream], frame, new Map(), scene).overrides).toBe(frame)
  })
})

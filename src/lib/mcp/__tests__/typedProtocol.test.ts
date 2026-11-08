import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import type { AnimatableValue } from '../../types'
import { assertOperation, assertScene } from '../protocol'
import { runSafeScript } from '../sandbox'
function fixture(property: string, values: unknown[]) {
  const scene = emptyScene(), layer = newRectLayer(), timeline = newTimeline()
  scene.layers = [layer]; scene.timelines = [timeline]
  timeline.tracks = [{ target: `layers.${layer.id}.${property}`, keyframes: values.map((value, index) => ({ id: `key${index}`, timeMs: index * 1000, value: value as AnimatableValue, easing: { type: 'linear' } })) }]
  return { scene, layer, track: timeline.tracks[0] }
}
describe('typed scene commit boundaries', () => {
  it('rejects wrong scalar types, mixed discrete families and malformed ColorValue objects', () => {
    expect(() => assertScene(fixture('transform.x', ['oops', '100']).scene)).toThrow(/value types/)
    expect(() => assertScene(fixture('text.value', ['A', false]).scene)).toThrow(/mixed/)
    expect(() => assertScene(fixture('style.fill.color', [{ r: 255, g: 0, b: 0 }, '#fff']).scene)).toThrow(/Invalid animated value/)
    expect(() => assertScene(fixture('style.fill.color', [{ r: 256, g: 0, b: 0, a: 255 }]).scene)).toThrow(/Invalid animated value/)
    expect(() => assertScene(fixture('style.fill.color', ['not-a-color']).scene)).toThrow(/Invalid animated color/)
  })
  it('accepts legacy packed colors, canonical vectors and optional geometry coordinate paths', () => {
    expect(() => assertScene(fixture('style.fill.color', [0xff0000, 0x0000ff]).scene)).not.toThrow()
    expect(() => assertScene(fixture('custom.vector', [{ x: 1, y: 2 }, { x: 3, y: 4 }]).scene)).not.toThrow()
    expect(() => assertScene(fixture('spline.points.point_id.x', [0, 20]).scene)).not.toThrow()
    expect(() => assertScene(fixture('spline.points.point_id', [{ x: 0, y: 20 }, { x: 20, y: 40 }]).scene)).not.toThrow()
  })
  it('rejects scalar signal processing on typed tracks while preserving numeric controllers', () => {
    const value = fixture('text.value', ['A', 'B'])
    value.track.modifiers = [{ id: 'm', type: 'offset', enabled: true, blendMode: 'replace', weight: 1, parameters: { delta: 1 } }]
    expect(() => assertScene(value.scene)).toThrow(/Scalar numeric/)
    value.track.modifiers = []
    value.track.controller = { type: 'waveform', waveform: { shape: 'sine', frequency: 1, amplitude: 1, offset: 0, phase: 0, duty: 0.5 } }
    expect(() => assertScene(value.scene)).toThrow(/Scalar numeric/)
    const numeric = fixture('transform.x', [0, 100]); numeric.track.controller = value.track.controller
    expect(() => assertScene(numeric.scene)).not.toThrow()
  })
})
describe('narrow numeric operation exceptions', () => {
  it('permits bounded metadata timestamps and color values without raising geometry/time/count quotas', () => {
    expect(() => assertOperation({ createdAt: 1793700000000, updatedAt: 1793700000001, metadata: { importedAt: 1793700000000 } })).not.toThrow()
    expect(() => assertOperation({ target: 'layers.hero.style.fill.color', keyframes: [{ timeMs: 0, value: 0xff0000 }] })).not.toThrow()
    expect(() => assertOperation({ property: 'style.fill.color', keyframes: [{ timeMs: 0, value: 0xff0000 }] })).not.toThrow()
    expect(() => assertOperation({ x: 0xff0000 })).toThrow(/Numeric/)
    expect(() => assertOperation({ target: 'layers.hero.style.fill.color', keyframes: [{ timeMs: 0xff0000, value: 0xff0000 }] })).toThrow(/Numeric/)
    expect(() => assertOperation({ color: 0xff0000, count: 5001 })).toThrow(/limit/i)
    expect(() => assertOperation({ createdAt: Number.MAX_SAFE_INTEGER })).toThrow(/Numeric/)
    expect(() => assertOperation({ updatedAt: 1.2 })).toThrow(/Numeric/)
  })
  it('round-trips snapshot wire metadata and accepts packed colors through both handle key bindings', async () => {
    const result = await runSafeScript(`
      scene.createTimeline({id:'main',durationMs:1000});
      scene.addParam('strength',1);
      const box=scene.add('rect');
      scene.wire('strength','opacity','source',{targetLayerId:box.id});
      const wire=scene.parameterWires[0];wire.enabled=false;
      scene.editEntity('parameterWires','update',wire.id,wire);
      box.key('style.fill.color',0,0xff0000);
      scene.timeline('main').key(box,'style.fill.color',1000,0x0000ff);
    `, emptyScene())
    expect(result.scene.parameterWires?.[0].enabled).toBe(false)
    expect(result.scene.parameterWires?.[0].createdAt).toBeGreaterThan(3600000)
    expect(result.scene.timelines[0].tracks[0].keyframes.map(key => key.value)).toEqual([0xff0000, 0x0000ff])
  })
})

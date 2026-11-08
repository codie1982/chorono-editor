import { describe, expect, it } from 'vitest'
import type { AnimatableValue, Track, Timeline, Binding, ParameterWire } from '../../types'
import { evaluateTrack, evaluateNumericTrack, evaluateTimelines, getLayerValue, getLayerPropertyValue, type OverrideMap } from '../../evaluator'
import { animatableColorToCss, parseAnimatableColor, isScalarNumericTrack } from '../typedValues'
import { blendOverrides } from '../../statemachine/blend'
import { bakeTrackToKeyframes } from '../baking/bake'
import { evaluateBindings } from '../../runtime/bindingEvaluator'
import { evaluateParameterWiresVerbose } from '../../runtime/parameterWireEvaluator'
const track = (target: string, from: AnimatableValue, to: AnimatableValue): Track => ({ target, keyframes: [
  { id: 'a', timeMs: 0, value: from, easing: { type: 'linear' } }, { id: 'b', timeMs: 1000, value: to, easing: { type: 'linear' } },
] })

describe('typed property animation', () => {
  it('interpolates legacy packed RGB by channel rather than packed integer arithmetic', () => {
    const value = evaluateTrack(track('layers.a.style.fill.color', 0xff0000, 0x0000ff), 500)
    expect(value).toBe(0x800080)
    expect(animatableColorToCss(value)).toBe('rgba(128,0,128,1)')
  })
  it('interpolates hex strings, mixed color representations and all four ColorValue channels', () => {
    expect(evaluateTrack(track('layers.a.style.fill.color', '#ff0000', '#0000ff'), 500)).toBe('rgba(128,0,128,1)')
    const values = track('layers.a.text.color', { r: 255, g: 0, b: 0, a: 255 }, { r: 0, g: 255, b: 100, a: 0 })
    expect(evaluateTrack(values, 500)).toEqual({ r: 127.5, g: 127.5, b: 50, a: 127.5 })
    expect(evaluateTrack(track('layers.a.style.fill.color', '#f008', 0x0000ff), 500)).toBe('rgba(128,0,128,0.766667)')
    expect(parseAnimatableColor('hsl(120 100% 50% / 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 127.5 })
    expect(parseAnimatableColor('rgb(100% 0% 50%)')).toEqual({ r: 255, g: 0, b: 127.5, a: 255 })
  })
  it('holds text and booleans until the exact next key, regardless of easing overshoot', () => {
    const text = track('layers.a.text.value', '100', '200')
    text.keyframes[0].easing = { type: 'customBezier', bezier: { cx1: 0, cy1: 3, cx2: 1, cy2: 3 } }
    expect(evaluateTrack(text, 999)).toBe('100')
    expect(evaluateTrack(text, 1000)).toBe('200')
    const flag = track('layers.a.hidden', false, true)
    expect(evaluateTrack(flag, 500)).toBe(false)
    expect(evaluateTrack(flag, 1000)).toBe(true)
    expect(evaluateTrack(track('layers.a.text.value', '#ff0000', '#0000ff'), 500)).toBe('#ff0000')
  })
  it('interpolates vectors with easing, hold and relative repeat without numeric coercion', () => {
    const vector = track('layers.a.custom.vector', { x: 10, y: -10 }, { x: 110, y: 30 })
    vector.keyframes[0].easing = { type: 'easeIn' }
    expect(evaluateTrack(vector, 500)).toEqual({ x: 22.5, y: -5 })
    vector.keyframes[0].easing = { type: 'linear' }
    vector.outOfRange = { before: 'constant', after: 'relativeRepeat' }
    expect(evaluateTrack(vector, 1500)).toEqual({ x: 160, y: 50 })
    vector.keyframes[0].easing = { type: 'hold' }
    expect(evaluateTrack(vector, 500)).toEqual({ x: 10, y: -10 })
  })
  it('preserves numeric modifiers while imported nonnumeric modifier stacks retain typed baseline', () => {
    const numeric = track('layers.a.opacity', 0, 100)
    numeric.modifiers = [{ id: 'offset', type: 'offset', enabled: true, blendMode: 'replace', weight: 1, parameters: { delta: 25 } }]
    // A valid built-in offset signal is numeric; no typed conversion intervenes.
    expect(evaluateTrack(numeric, 500)).toBe(75)
    const text = track('layers.a.text.value', 'A', 'B')
    text.modifiers = numeric.modifiers
    text.multiplierCurve = { cx1: 0.25, cy1: 0.25, cx2: 0.75, cy2: 0.75 }
    expect(evaluateTrack(text, 500)).toBe('A')
    text.controller = { type: 'waveform', waveform: { shape: 'sine', frequency: 1, amplitude: 20, offset: 10, phase: 0, duty: 0.5 } }
    expect(evaluateTrack(text, 500)).toBe('A') // unsupported scalar controller never replaces text with a number
    expect(evaluateNumericTrack(text, 500)).toBeNull()
    expect(() => bakeTrackToKeyframes(text, { startMs: 0, endMs: 1000, fps: 60, tolerance: 0.01 })).toThrow('scalar numeric')
  })
  it('keeps typed frame overrides while numeric lookups reject incompatible/nonfinite overrides', () => {
    const timeline: Timeline = { id: 't', durationMs: 1000, autoplay: false, loop: false, tracks: [track('layers.a.text.value', 'A', 'B'), track('layers.a.hidden', false, true)] }
    const overrides = evaluateTimelines([timeline], 500)
    expect(overrides.get('layers.a.text.value')).toBe('A')
    expect(overrides.get('layers.a.hidden')).toBe(false)
    expect(getLayerPropertyValue(overrides, 'a', 'hidden', true)).toBe(false)
    expect(getLayerValue(overrides, 'a', 'text.value', 7)).toBe(7)
    overrides.set('layers.a.opacity', NaN)
    expect(getLayerValue(overrides, 'a', 'opacity', 0.4)).toBe(0.4)
  })
  it('blends state-machine colors/vectors continuously and discrete values at completion', () => {
    const from: OverrideMap = new Map<string, AnimatableValue>([['layers.a.style.fill.color', '#ff0000'], ['layers.a.custom.vector', { x: 0, y: 10 }], ['layers.a.text.value', 'Idle']])
    const to: OverrideMap = new Map<string, AnimatableValue>([['layers.a.style.fill.color', '#0000ff'], ['layers.a.custom.vector', { x: 100, y: 20 }], ['layers.a.text.value', 'Active']])
    const result = blendOverrides(from, to, 0.5)
    expect(result.get('layers.a.style.fill.color')).toBe('rgba(128,0,128,1)')
    expect(result.get('layers.a.custom.vector')).toEqual({ x: 50, y: 15 })
    expect(result.get('layers.a.text.value')).toBe('Idle')
    expect(blendOverrides(from, to, 1).get('layers.a.text.value')).toBe('Active')
  })
  it('does not feed typed animated values into scalar bindings and expression wires', () => {
    const frames: OverrideMap = new Map([['layers.a.text.value', '120']])
    const binding = { id: 'binding', source: { type: 'layerProperty', layerId: 'a', property: 'text.value' },
      target: { type: 'layerProperty', layerId: 'b', property: 'transform.x' },
      map: { inputMin: 0, inputMax: 100, outputMin: 0, outputMax: 100, clamp: false, reverse: false } } as Binding
    expect(evaluateBindings([binding], frames, new Map(), { layers: [] })).toBe(frames)
    const wire = { id: 'wire', enabled: true, source: { layerId: 'a', propertyPath: 'text.value', valueType: 'number' },
      target: { layerId: 'b', propertyPath: 'transform.x', valueType: 'number' }, expression: 'source * 2', blendMode: 'override', createdAt: 0, updatedAt: 0 } as ParameterWire
    const result = evaluateParameterWiresVerbose([wire], frames, new Map(), { layers: [] })
    expect(result.overrides.has('layers.b.transform.x')).toBe(false)
    expect(result.brokenWireIds.has('wire')).toBe(true)
  })
  it('uses one scalar-operation gate for graph, controller/modifier and bake affordances', () => {
    expect(isScalarNumericTrack(track('layers.a.opacity', 0, 1))).toBe(true)
    expect(isScalarNumericTrack(track('layers.a.style.fill.color', 0xff0000, 0x0000ff))).toBe(false)
    expect(isScalarNumericTrack(track('layers.a.text.value', 'A', 'B'))).toBe(false)
    expect(isScalarNumericTrack(track('layers.a.hidden', false, true))).toBe(false)
    expect(isScalarNumericTrack(track('layers.a.custom.vector', { x: 0, y: 0 }, { x: 1, y: 2 }))).toBe(false)
    expect(isScalarNumericTrack({ target: 'layers.a.text.fontFamily', keyframes: [] }, 'Inter')).toBe(false)
    expect(isScalarNumericTrack({ target: 'layers.a.transform.x', keyframes: [] }, 0)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTextLayer, newTimeline } from '../../defaults'
import type { ChronoScene, Keyframe, Layer, Vec2 } from '../../types'
import { prepareSetKey } from './setKey'
import { DEFAULT_WAVEFORM_PARAMS } from '../../types'
import { evaluateTrack } from '../../evaluator'
import { upsertKeyframe } from '../keyframeOps'
import { executeAuthoredCommand } from '../../editor/authoring/AuthoringCommand'
import { fieldAuthoring } from '../../editor/authoring/AuthoringQuery'
import { attributeSourceChange } from '../../editor/authoring/Attribution'
import { initHistory, pushHistory, redoHistory, undoHistory } from '../../editor/history'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

const key = (id: string, timeMs: number, value: number): Keyframe => ({ id, timeMs, value, easing: { type: 'linear' } })
function fixture() {
  const scene = emptyScene(), layer = { ...newRectLayer(), id: 'hero' }, timeline = { ...newTimeline(), id: 'active' }
  timeline.layerIds = []; timeline.tracks = [{ target: 'layers.hero.transform.x', keyframes: [key('start', 0, 0), key('end', 1000, 100)] }]
  scene.layers = [layer]; scene.timelines = [timeline]
  return scene
}
const options = { timelineId: 'active', layerIds: ['hero'], timeMs: 500, keyset: 'animated' as const }

describe('Set Key source/identity contract', () => {
  it('samples interpolation rather than base/world output, adds membership and restores exact source with one undo', () => {
    const scene = fixture(), before = JSON.stringify(scene), plan = prepareSetKey(scene, options)
    expect(plan.diagnostics).toEqual([])
    const next = executeAuthoredCommand(plan.command!, scene)
    expect(next.layers).toBe(scene.layers)
    expect(next.timelines[0].tracks[0].keyframes.map(key => key.value)).toEqual([0, 50, 100])
    expect(next.timelines[0].layerIds).toEqual(['hero'])
    const history = pushHistory(initHistory(scene), next)
    expect(history.past).toHaveLength(1); expect(undoHistory(history).present).toBe(scene)
    expect(redoHistory(undoHistory(history)).present).toBe(next)
    expect(parseSceneJson(JSON.stringify(next), true)).toEqual(next)
    expect(JSON.stringify(scene)).toBe(before)
    expect(plan.command!.execute(scene).timelines[0].tracks[0].keyframes).toEqual(next.timelines[0].tracks[0].keyframes)
  })

  it('keeps existing key IDs, easing, tangents and segment modifiers at an exact-time value update', () => {
    let scene = fixture()
    const manual: Keyframe = { ...key('manual', 500, 37), tangentMode: 'aligned', easing: { type: 'customBezier', bezier: { cx1: .2, cy1: .1, cx2: .8, cy2: .9 } }, segmentModifiers: [] }
    scene.timelines[0].tracks[0].keyframes.splice(1, 0, manual)
    scene = attributeSourceChange(emptyScene(), scene, { actor: { kind: 'human' }, transactionId: 'manual-source' })
    const plan = prepareSetKey(scene, { ...options, authoredValues: new Map([['layers.hero.transform.x', 63]]) })
    const next = executeAuthoredCommand(plan.command!, scene)
    expect(next.timelines[0].tracks[0].keyframes[1]).toEqual({ ...manual, value: 63 })
    expect(fieldAuthoring(next, ['key', 'active', 'layers.hero.transform.x', 'manual'], ['easing', 'type']).transactionId).toBe('manual-source')
  })

  it('preserves sub-ms neighbours and refuses ambiguous coincident keys instead of deleting them', () => {
    const scene = fixture(), target = 'layers.hero.transform.x'
    scene.timelines[0].tracks[0].keyframes = [key('a', 500, 1), key('b', 500.25, 2)]
    const next = upsertKeyframe(scene, 'active', target, key('replacement', 500, 10))
    expect(next.timelines[0].tracks[0].keyframes.map(key => [key.id, key.value])).toEqual([['a', 10], ['b', 2]])
    expect(upsertKeyframe(next, 'active', target, key('between', 500.125, 4)).timelines[0].tracks[0].keyframes).toHaveLength(3)
    const ambiguous = { ...scene, timelines: [{ ...scene.timelines[0], tracks: [{ target, keyframes: [key('a', 500, 1), key('b', 500, 2)] }] }] }
    expect(prepareSetKey(ambiguous, options)).toMatchObject({ command: null, targets: [] })
    expect(() => upsertKeyframe(ambiguous, 'active', target, key('new', 500, 3))).toThrow(/Multiple keys/)
  })

  it('supports 50 selected layers as one command and preserves unselected names, transforms, keys and parents', () => {
    const scene = fixture(), root = { ...newRectLayer(), id: 'parent', type: 'group' as const }
    scene.layers.push(root, ...Array.from({ length: 50 }, (_, i) => ({ ...newRectLayer(), id: `child-${i}`, parentId: root.id })))
    const ids = scene.layers.slice(2).map(layer => layer.id), before = scene.timelines[0].tracks[0]
    const plan = prepareSetKey(scene, { ...options, keyset: 'transform', layerIds: ids })
    const next = plan.command!.execute(scene)
    expect(plan.targets).toHaveLength(300); expect(next.layers).toBe(scene.layers)
    expect(next.timelines[0].tracks[0]).toBe(before)
    expect(pushHistory(initHistory(scene), next).past).toHaveLength(1)
  })

  it('uses typed colors, strings, booleans and vectors without fabricating absent optional payloads', () => {
    const scene = fixture(), text: Layer & { customVector: Vec2 } = { ...newTextLayer(), id: 'text', customVector: { x: 2, y: 3 } }
    scene.layers = [text]
    const values = new Map<string, import('../../types').AnimatableValue>([['text.color', '#ff0000'], ['text.value', '09:05'], ['text.uppercase', true], ['customVector', { x: 2, y: 3 }]])
    scene.timelines[0].tracks = Array.from(values, ([path, value]) => ({ target: `layers.text.${path}`, keyframes: [{ id: path, timeMs: 0, value, easing: { type: 'hold' } }] }))
    const plan = prepareSetKey(scene, { ...options, layerIds: ['text'], timeMs: 500 })
    const next = plan.command!.execute(scene)
    expect(next.timelines[0].tracks.map(track => track.keyframes[1].value)).toEqual(Array.from(values.values()))
    expect(next.layers[0].effects).toBeUndefined()
    expect(prepareSetKey(scene, { ...options, layerIds: ['text'], keyset: 'selected', selectedTargets: new Set(['layers.text.effects.blur']) }).command).toBeNull()
  })

  it('selected keyset narrows all selected objects by exact target; structural IDs never become channels', () => {
    const scene = fixture(); scene.timelines[0].tracks.push({ target: 'layers.hero.parentId', keyframes: [{ id: 'legacy-id', timeMs: 0, value: 'manual', easing: { type: 'hold' } }] })
    const plan = prepareSetKey(scene, { ...options, keyset: 'selected', selectedTargets: new Set(['layers.hero.transform.x', 'layers.hero.parentId']) })
    expect(plan.targets).toEqual(['layers.hero.transform.x'])
    expect(plan.command!.execute(scene).timelines[0].tracks[1]).toBe(scene.timelines[0].tracks[1])
  })

  for (const kind of ['modifier', 'controller', 'warp', 'wire', 'binding', 'path', 'locked', 'frozen'] as const) it(`reports ${kind} inputs before allowing any partial commit`, () => {
    const scene = fixture(), layer = scene.layers[0], track = scene.timelines[0].tracks[0]
    if (kind === 'modifier') track.modifiers = [{ id: 'modifier', type: 'offset', enabled: true, blendMode: 'replace', weight: 1, parameters: { offset: 5 } }]
    if (kind === 'controller') track.controller = { type: 'waveform', waveform: { ...DEFAULT_WAVEFORM_PARAMS } }
    if (kind === 'warp') track.timeWarp = { cx1: .2, cy1: .1, cx2: .8, cy2: .9 }
    if (kind === 'wire') layer.paramBindings = { 'transform.x': 'position' }
    if (kind === 'binding') scene.bindings = [{ id: 'binding', source: { type: 'parameter', paramId: 'x' }, target: { type: 'layerProperty', layerId: 'hero', property: 'transform.x' }, map: { inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1 } }]
    if (kind === 'path') layer.motionPath = { pathData: 'M 0 0 L 100 0' }
    if (kind === 'locked' || kind === 'frozen') layer[kind] = true
    const before = JSON.stringify(scene), plan = prepareSetKey(scene, options)
    expect(plan.command).toBeNull(); expect(plan.diagnostics.length).toBeGreaterThan(0)
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('refuses stale source and invalid authored times without changing any user data', () => {
    const scene = fixture(), plan = prepareSetKey(scene, options)
    expect(() => plan.command!.execute({ ...scene, layers: [...scene.layers] })).toThrow(/Source changed/)
    for (const timeMs of [-1, 1001, NaN, Infinity]) expect(() => prepareSetKey(scene, { ...options, timeMs })).toThrow()
    const next = plan.command!.execute(scene)
    expect(evaluateTrack(next.timelines[0].tracks[0], 500)).toBe(50)
  })
})

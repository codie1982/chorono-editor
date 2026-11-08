import { describe, expect, it } from 'vitest'
import type { ChronoScene, Keyframe, Track } from '../types'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import { evaluateTimelines } from '../evaluator'
import { makeUpdateLayerCmd } from './commands-layer'
import { makeBatchCmd } from './commands-batch'
import { initHistory, pushHistory, undoHistory, redoHistory } from './history'
import { buildViewportKeyframeCommands } from './viewportKeyframes'

/** A keyed x channel and an independently animated y channel share one layer. */
function fixture(): ChronoScene {
  const hero = newRectLayer()
  hero.id = 'hero'
  hero.transform = { ...hero.transform, x: 0, y: 10, scaleX: 1, scaleY: 1, rotationDeg: 0 }
  const xKey: Keyframe & { annotation: string } = {
    id: 'x-mid', timeMs: 500, value: 50, easing: { type: 'customBezier', bezier: { cx1: 0.2, cy1: 0.1, cx2: 0.7, cy2: 0.9 } },
    tangentMode: 'broken', annotation: 'hand-authored',
  }
  const timeline = newTimeline()
  timeline.id = 'active'; timeline.durationMs = 1000; timeline.loop = false; timeline.layerIds = []
  timeline.tracks = [
    { target: 'layers.hero.transform.x', keyframes: [
      { id: 'x-start', timeMs: 0, value: 0, easing: { type: 'linear' } }, xKey,
      { id: 'x-end', timeMs: 1000, value: 100, easing: { type: 'linear' } },
    ] },
    { target: 'layers.hero.transform.y', keyframes: [
      { id: 'y-start', timeMs: 0, value: 10, easing: { type: 'easeIn' } },
      { id: 'y-end', timeMs: 1000, value: 90, easing: { type: 'hold' } },
    ] },
  ]
  return { ...emptyScene(), layers: [hero], timelines: [timeline] }
}

describe('viewport source and key transaction', () => {
  it('does not impose animation clock requirements on geometry-only edits', () => {
    const scene = fixture(), prev = scene.layers[0], before = structuredClone(scene)
    scene.timelines[0].durationMs = 0
    const next = { ...prev, size: { width: 120, height: 80 } }
    for (const timelineId of ['active', 'missing']) {
      expect(buildViewportKeyframeCommands(scene, [{ prev, next, changedProperties: ['size.width'] }],
        { timelineId, timeMs: 0, autoKeyframe: true })).toEqual([])
    }
    expect(scene.layers).toEqual(before.layers)
    expect(scene.timelines[0].tracks).toEqual(before.timelines[0].tracks)
  })

  it('allows a Manual base-only transform on a zero-duration timeline', () => {
    const scene = fixture(), prev = scene.layers[0]
    scene.timelines[0].durationMs = 0
    const next = { ...prev, transform: { ...prev.transform, rotationDeg: 35 } }
    expect(buildViewportKeyframeCommands(scene, [{ prev, next }],
      { timelineId: 'active', timeMs: 0, autoKeyframe: false })).toEqual([])
    expect(() => buildViewportKeyframeCommands(scene, [{ prev, next }],
      { timelineId: 'active', timeMs: 0, autoKeyframe: true })).toThrow(/duration/)
  })

  it('updates actual evaluator output and key metadata in one reversible history entry', () => {
    const scene = fixture(), before = structuredClone(scene), prev = scene.layers[0]
    const next = { ...prev, transform: { ...prev.transform, x: 75 } }
    expect(evaluateTimelines(scene.timelines, 500).get('layers.hero.transform.x')).toBe(50)
    const keys = buildViewportKeyframeCommands(scene, [{ prev, next }], { timelineId: 'active', timeMs: 500, autoKeyframe: false })
    const command = makeBatchCmd('Move viewport position', [makeUpdateLayerCmd(prev.id, next, prev), ...keys])
    const after = command.execute(scene)
    expect(evaluateTimelines(after.timelines, 500).get('layers.hero.transform.x')).toBe(75)
    expect(after.layers[0].transform.x).toBe(75)
    expect(after.timelines[0].tracks[0].keyframes[1]).toEqual({ ...scene.timelines[0].tracks[0].keyframes[1], value: 75 })
    expect(after.timelines[0].tracks[0].keyframes[0]).toBe(scene.timelines[0].tracks[0].keyframes[0])
    expect(after.timelines[0].tracks[1]).toBe(scene.timelines[0].tracks[1])
    expect(after.timelines[0].layerIds).toEqual([prev.id])
    expect(scene).toEqual(before)
    expect(command.undo(after)).toEqual(scene)
    const history = pushHistory(initHistory(scene), after)
    expect(history.past).toHaveLength(1)
    expect(undoHistory(history).present).toBe(scene)
    expect(redoHistory(undoHistory(history)).present).toEqual(after)
  })

  it('keys an intended rendered-50-to-authored-0 edit despite unchanged source values', () => {
    const scene = fixture(), prev = scene.layers[0], before = structuredClone(scene)
    const next = { ...prev, transform: { ...prev.transform, x: 0 } }
    const commands = buildViewportKeyframeCommands(scene, [{ prev, next, changedProperties: ['transform.x'] }],
      { timelineId: 'active', timeMs: 500, autoKeyframe: false })
    expect(commands).toHaveLength(1)
    const after = commands[0].execute(scene)
    expect(evaluateTimelines(after.timelines, 500).get('layers.hero.transform.x')).toBe(0)
    expect(after.timelines[0].tracks[0].keyframes[1].id).toBe('x-mid')
    expect(after.layers[0]).toBe(prev)
    expect(commands[0].undo(after)).toEqual(scene)
    expect(scene).toEqual(before)
  })

  it('preserves unedited keyed position/scale when only rotation intent is committed', () => {
    const scene = fixture(), prev = scene.layers[0]
    const scale: Track = { target: 'layers.hero.transform.scaleX', keyframes: [
      { id: 'scale-start', timeMs: 0, value: 1, easing: { type: 'linear' } },
      { id: 'scale-end', timeMs: 1000, value: 2, easing: { type: 'linear' } },
    ] }
    scene.timelines[0].tracks.push(scale)
    const before = structuredClone(scene)
    const next = { ...prev, transform: { ...prev.transform, rotationDeg: 30 } }
    const commands = buildViewportKeyframeCommands(scene, [{ prev, next, changedProperties: ['transform.rotationDeg'] }],
      { timelineId: 'active', timeMs: 500, autoKeyframe: true })
    const after = makeBatchCmd('Rotate viewport', [makeUpdateLayerCmd(prev.id, next, prev), ...commands]).execute(scene)
    expect(after.layers[0].transform).toMatchObject({ x: 0, y: 10, scaleX: 1, rotationDeg: 30 })
    expect(after.timelines[0].tracks.slice(0, 3)).toEqual(scene.timelines[0].tracks)
    const values = evaluateTimelines(after.timelines, 500)
    expect(values.get('layers.hero.transform.x')).toBe(50)
    expect(values.get('layers.hero.transform.scaleX')).toBe(1.5)
    expect(values.get('layers.hero.transform.rotationDeg')).toBe(30)
    expect(scene).toEqual(before)
  })

  it('keys existing channels in Manual and creates new channels only in Auto', () => {
    const scene = fixture(), prev = scene.layers[0]
    const next = { ...prev, transform: { ...prev.transform, x: 80, rotationDeg: 25 } }
    const manual = buildViewportKeyframeCommands(scene, [{ prev, next }], { timelineId: 'active', timeMs: 250, autoKeyframe: false })
    const manualScene = manual[0].execute(scene)
    expect(manualScene.timelines[0].tracks).toHaveLength(2)
    expect(evaluateTimelines(manualScene.timelines, 250).get('layers.hero.transform.x')).toBe(80)
    expect(manualScene.timelines[0].layerIds).toEqual([prev.id])
    const automatic = buildViewportKeyframeCommands(scene, [{ prev, next }], { timelineId: 'active', timeMs: 250, autoKeyframe: true })
    const autoScene = automatic[0].execute(scene)
    const rotation = autoScene.timelines[0].tracks.find(track => track.target.endsWith('.rotationDeg'))!
    expect(rotation.keyframes).toHaveLength(1)
    expect(rotation.keyframes[0]).toMatchObject({ timeMs: 250, value: 25, easing: { type: 'linear' } })
    expect(evaluateTimelines(autoScene.timelines, 250).get(rotation.target)).toBe(25)
    const onlyNew = { ...prev, transform: { ...prev.transform, rotationDeg: 25 } }
    expect(buildViewportKeyframeCommands(scene, [{ prev, next: onlyNew }], { timelineId: 'active', timeMs: 250, autoKeyframe: false })).toEqual([])
    expect(automatic[0].undo(autoScene)).toEqual(scene)
  })

  it.each([
    { mode: 'loop', loop: true, pingPong: false, loopCount: 0, projectMs: 1250, localMs: 250 },
    { mode: 'ping-pong', loop: false, pingPong: true, loopCount: 0, projectMs: 1250, localMs: 750 },
    { mode: 'bounded ping-pong', loop: false, pingPong: true, loopCount: 1, projectMs: 2500, localMs: 0 },
    { mode: 'bounded loop', loop: true, pingPong: false, loopCount: 2, projectMs: 2500, localMs: 1000 },
    { mode: 'one-shot hold', loop: false, pingPong: false, loopCount: 0, projectMs: 2500, localMs: 1000 },
  ])('uses the evaluator clock for $mode edits', ({ loop, pingPong, loopCount, projectMs, localMs }) => {
    const scene = fixture(), prev = scene.layers[0]
    Object.assign(scene.timelines[0], { loop, pingPong, loopCount })
    const next = { ...prev, transform: { ...prev.transform, x: 42 } }
    const commands = buildViewportKeyframeCommands(scene, [{ prev, next }], { timelineId: 'active', timeMs: projectMs, autoKeyframe: false })
    const after = commands[0].execute(scene)
    expect(after.timelines[0].tracks[0].keyframes.find(key => key.timeMs === localMs)?.value).toBe(42)
    expect(evaluateTimelines(after.timelines, projectMs).get('layers.hero.transform.x')).toBe(42)
    expect(after.timelines[0].tracks[0].keyframes.every(key => key.timeMs <= 1000)).toBe(true)
  })

  it('refuses a driven channel atomically after another intended channel was processed', () => {
    const scene = fixture(), prev = scene.layers[0]
    scene.timelines[0].tracks[1].controller = { type: 'waveform', waveform: {
      shape: 'sine', frequency: 1, amplitude: 10, phase: 0, offset: 20, duty: 0.5,
    } }
    const before = structuredClone(scene), next = { ...prev, transform: { ...prev.transform, x: 75, y: 30 } }
    expect(() => buildViewportKeyframeCommands(scene, [{ prev, next }], { timelineId: 'active', timeMs: 500, autoKeyframe: true })).toThrow(/Bake driven/)
    expect(scene).toEqual(before)
  })

  it.each([500.25, 499.5])('refuses a near-key collision at %s ms without changing source', timeMs => {
    const scene = fixture(), prev = scene.layers[0], before = structuredClone(scene)
    const next = { ...prev, transform: { ...prev.transform, x: 75 } }
    expect(() => buildViewportKeyframeCommands(scene, [{ prev, next }], { timelineId: 'active', timeMs, autoKeyframe: false })).toThrow(/nearby keyframe/)
    expect(scene).toEqual(before)
  })

  it('refuses a competing timeline without touching either timeline or the layer', () => {
    const scene = fixture(), prev = scene.layers[0]
    scene.timelines.push({ ...newTimeline(), id: 'other', durationMs: 1000, tracks: [scene.timelines[0].tracks[0]] })
    const before = structuredClone(scene), next = { ...prev, transform: { ...prev.transform, x: 75 } }
    expect(() => buildViewportKeyframeCommands(scene, [{ prev, next }], { timelineId: 'active', timeMs: 500, autoKeyframe: false })).toThrow(/another timeline/)
    expect(scene).toEqual(before)
  })
})

import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import type { ChronoScene, Layer } from '../types'
import { evaluateTimelines } from '../evaluator'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'
import { initHistory, pushHistory, undoHistory, redoHistory } from './history'
import { buildViewportNudgeCommand } from './viewportNudge'

/** Independent selected roots and a selected descendant share one nudge. */
function nestedScene(): ChronoScene {
  const parent = { ...newRectLayer(), id: 'parent', type: 'group' as const,
    transform: { x: 400, y: 200, anchorX: 0, anchorY: 0, rotationDeg: 30, scaleX: -2, scaleY: 0.75 } }
  const child = { ...newRectLayer(), id: 'child', parentId: parent.id,
    transform: { x: 30, y: 20, anchorX: 10, anchorY: 5, rotationDeg: 15, scaleX: 1, scaleY: 1 } }
  const peer = { ...newRectLayer(), id: 'peer' }
  return { ...emptyScene(), layers: [parent, child, peer], timelines: [] }
}

/** Inspect a native geometry point in composition space, independently of the
 * inverse-parent gesture algorithm under test. */
function world(scene: ChronoScene, id: string, timeMs = 0) {
  const layer = scene.layers.find(item => item.id === id)!
  return resolveLayerWorldMatrix(layer, scene, timeMs).applyToPoint({ x: 23, y: 17 })
}

const options = { timelineId: 'motion', timeMs: 500, autoKeyframe: false }

describe('atomic selected-root keyboard movement', () => {
  it('moves parent/child selection and an independent peer once by the same world delta', () => {
    const scene = nestedScene(), before = structuredClone(scene)
    const command = buildViewportNudgeCommand(scene, new Set(['child', 'parent', 'peer']), { x: 1, y: -10 }, options)!
    const after = command.execute(scene)
    expect(after.layers[1]).toBe(scene.layers[1])
    for (const id of ['parent', 'child', 'peer']) {
      const a = world(scene, id), b = world(after, id)
      expect(b.x - a.x).toBeCloseTo(1); expect(b.y - a.y).toBeCloseTo(-10)
    }
    expect(scene).toEqual(before)
    const history = pushHistory(initHistory(scene), after)
    expect(history.past).toHaveLength(1)
    expect(undoHistory(history).present).toEqual(before)
    expect(redoHistory(undoHistory(history)).present).toEqual(after)
    expect(command.undo(after)).toEqual(before)
  })

  it('converts a child-only nudge through reflected/nonuniform parent axes', () => {
    const scene = nestedScene(), before = structuredClone(scene)
    const command = buildViewportNudgeCommand(scene, ['child', 'peer'], { x: -10, y: 1 }, options)!
    const after = command.execute(scene)
    expect(after.layers[0]).toBe(scene.layers[0])
    for (const id of ['child', 'peer']) {
      const a = world(scene, id), b = world(after, id)
      expect(b.x - a.x).toBeCloseTo(-10); expect(b.y - a.y).toBeCloseTo(1)
    }
    expect(scene).toEqual(before)
  })

  it('keys only the moved displayed channel and preserves endpoint IDs/easing and unrelated animated fallback values', () => {
    const hero = { ...newRectLayer(), id: 'hero' }, timeline = newTimeline()
    timeline.id = 'motion'; timeline.durationMs = 1000; timeline.loop = false
    timeline.tracks = [
      { target: 'layers.hero.transform.x', keyframes: [
        { id: 'start', timeMs: 0, value: 0, easing: { type: 'easeInOut' } },
        { id: 'mid', timeMs: 500, value: 50, easing: { type: 'customBezier', bezier: { cx1: 0.2, cy1: 0.1, cx2: 0.7, cy2: 0.9 } }, tangentMode: 'broken' },
        { id: 'end', timeMs: 1000, value: 100, easing: { type: 'hold' } },
      ] },
      { target: 'layers.hero.transform.y', keyframes: [
        { id: 'y', timeMs: 500, value: 200, easing: { type: 'linear' } },
      ] },
      { target: 'layers.hero.transform.scaleX', keyframes: [
        { id: 'scale', timeMs: 500, value: 1.5, easing: { type: 'linear' } },
      ] },
    ]
    const scene = { ...emptyScene(), layers: [hero], timelines: [timeline] }, before = structuredClone(scene)
    const command = buildViewportNudgeCommand(scene, [hero.id], { x: 1, y: 0 }, options)!
    const after = command.execute(scene)
    expect(evaluateTimelines(after.timelines, 500).get('layers.hero.transform.x')).toBe(51)
    expect(after.layers[0].transform).toEqual({ ...hero.transform, x: 51 })
    expect(after.timelines[0].tracks[0].keyframes).toEqual(timeline.tracks[0].keyframes.map(key => key.id === 'mid' ? { ...key, value: 51 } : key))
    expect(after.timelines[0].tracks.slice(1)).toEqual(timeline.tracks.slice(1))
    expect(command.undo(after)).toEqual(before); expect(scene).toEqual(before)
  })

  it('uses authoritative frame overrides without stamping unrelated displayed channels', () => {
    const hero = { ...newRectLayer(), id: 'hero' }, scene = { ...emptyScene(), layers: [hero], timelines: [] }
    const command = buildViewportNudgeCommand(scene, [hero.id], { x: 1, y: 0 }, { ...options, overrides: new Map([
      ['layers.hero.transform.x', 100], ['layers.hero.transform.rotationDeg', 45],
    ]) })!
    expect(command.execute(scene).layers[0].transform).toEqual({ ...hero.transform, x: 101 })
  })

  it('returns null for empty/no-op edits, without manufacturing a history command', () => {
    const scene = nestedScene()
    expect(buildViewportNudgeCommand(scene, [], { x: 1, y: 0 }, options)).toBeNull()
    expect(buildViewportNudgeCommand(scene, new Set(), { x: 1, y: 0 }, options)).toBeNull()
    expect(buildViewportNudgeCommand(scene, ['child'], { x: 0, y: 0 }, options)).toBeNull()
  })

  it.each(['locked', 'frozen', 'singular', 'nonfinite', 'driver', 'competing timeline'])('rejects %s atomically before returning a command', reason => {
    const scene = nestedScene()
    if (reason === 'locked') scene.layers[0].locked = true
    if (reason === 'frozen') scene.layers[1].frozen = true
    if (reason === 'singular') scene.layers[0].transform.scaleX = 0
    if (reason === 'driver') scene.layers[1].motionPath = { pathData: 'M0 0 L100 100', autoRotate: false, offset: 0 } as Layer['motionPath']
    if (reason === 'competing timeline') {
      scene.timelines = [{ ...newTimeline(), id: 'other', tracks: [{ target: 'layers.child.transform.x', keyframes: [
        { id: 'other-key', timeMs: 500, value: 10, easing: { type: 'linear' } },
      ] }] }]
    }
    const before = structuredClone(scene)
    expect(() => buildViewportNudgeCommand(scene, ['peer', 'child'], { x: reason === 'nonfinite' ? Infinity : 1, y: 0 }, options)).toThrow()
    expect(scene).toEqual(before)
  })
})

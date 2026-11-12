import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { evaluateTimelines } from '@/lib/evaluator'
import { buildViewportKeyframeCommands } from '@/lib/editor/viewportKeyframes'
import { prepareTransformTargets } from './preparedTransforms'
import { sourceTransformChange } from './sourceTransformChange'

/** Capture a pose whose displayed position/scale differ from authored fallback. */
function fixture() {
  const layer = newRectLayer(); layer.id = 'hero'
  layer.transform = { ...layer.transform, x: 0, y: 10, scaleX: 1, scaleY: -1, rotationDeg: 0 }
  const timeline = newTimeline(); timeline.id = 'motion'; timeline.durationMs = 1000; timeline.loop = false
  timeline.tracks = [{ target: 'layers.hero.transform.x', keyframes: [
    { id: 'start', timeMs: 0, value: 0, easing: { type: 'linear' } },
    { id: 'end', timeMs: 1000, value: 100, easing: { type: 'linear' } },
  ] }]
  const scene = { ...emptyScene(), layers: [layer], timelines: [timeline] }
  const frame = evaluateTimelines(scene.timelines, 500)
  frame.set('layers.hero.transform.scaleX', 1.5)
  const prepared = prepareTransformTargets(scene, [layer.id], 500, frame)
  if (!prepared.ok) throw new Error(prepared.reason)
  return { scene, layer, target: prepared.targets[0] }
}

describe('evaluated transform to source edit intent', () => {
  it('patches only changed rotation onto source without stamping displayed position or scale', () => {
    const { scene, layer, target } = fixture(), before = structuredClone(scene)
    const change = sourceTransformChange(target, { ...target.transform, rotationDeg: 30 })!
    expect(change.prev).toBe(layer)
    expect(change.changedProperties).toEqual(['transform.rotationDeg'])
    expect(change.next.transform).toMatchObject({ x: 0, y: 10, scaleX: 1, scaleY: -1, rotationDeg: 30 })
    expect(change.next.size).toBe(layer.size)
    expect(change.next.transform).not.toBe(layer.transform)
    expect(scene).toEqual(before)
  })

  it('retains explicit intent when dragging the displayed value back to its authored fallback', () => {
    const { scene, target } = fixture(), before = structuredClone(scene)
    expect(target.transform.x).toBe(50)
    const change = sourceTransformChange(target, { ...target.transform, x: 0 })!
    expect(change.next.transform.x).toBe(change.prev.transform.x)
    expect(change.changedProperties).toEqual(['transform.x'])
    const commands = buildViewportKeyframeCommands(scene, [change], { timelineId: 'motion', timeMs: 500, autoKeyframe: false })
    const after = commands[0].execute(scene)
    expect(evaluateTimelines(after.timelines, 500).get('layers.hero.transform.x')).toBe(0)
    expect(scene).toEqual(before)
    expect(commands[0].undo(after)).toEqual(scene)
  })

  it('returns no edit for the same displayed pose, including matrix roundoff, and rejects non-finite channels', () => {
    const { scene, target } = fixture(), before = structuredClone(scene)
    expect(sourceTransformChange(target, { ...target.transform })).toBeNull()
    expect(sourceTransformChange(target, { ...target.transform, x: target.transform.x + 1e-10 })).toBeNull()
    expect(() => sourceTransformChange(target, { ...target.transform, scaleY: NaN })).toThrow(RangeError)
    expect(scene).toEqual(before)
  })
})

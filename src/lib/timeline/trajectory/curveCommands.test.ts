import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { evaluateNumericTrack } from '../../evaluator'
import { buildTrajectoryModel } from './model'
import { projectTrajectoryPosition } from './frame'
import { trajectoryCurveHandles } from './curveHandles'
import { setTrajectoryNodeCurve, setTrajectorySegmentEasing, moveTrajectoryHandle } from './curveCommands'
import { setTrajectoryPoint } from './positionCommands'
import { hitTrajectory } from './hitTesting'

const scope = { timelineId: 'active', layerId: 'hero' }
function fixture() {
  const scene = emptyScene(), layer = newRectLayer(), timeline = newTimeline()
  layer.id = 'hero'; layer.transform.anchorX = 30; layer.transform.anchorY = 20
  timeline.id = 'active'; timeline.durationMs = 1000; timeline.loop = true
  timeline.tracks = ['x', 'y'].map((axis, a) => ({ target: `layers.hero.transform.${axis}`, keyframes: [0, 500, 1000].map((timeMs, i) => ({
    id: `${axis}-${i}`, timeMs, value: timeMs / (a ? 5 : 2), easing: { type: 'linear' as const },
  })) }))
  scene.layers = [layer]; scene.timelines = [timeline]; return scene
}
function nodeCurve(mode: 'broken' | 'aligned' = 'broken') {
  const scene = fixture(), change = setTrajectoryNodeCurve(scene, { ...scope, timeMs: 500, mode })
  return { scene, change, next: change.command!.execute(scene) }
}
describe('viewport native curve authoring', () => {
  it('enables two independent handles without changing keys, IDs or poses; undo restores the original source', () => {
    const { scene, change, next } = nodeCurve()
    const model = buildTrajectoryModel(next, scope.timelineId, scope.layerId)
    expect(trajectoryCurveHandles(model.context!, 500).map(handle => handle.side)).toEqual(['in', 'out'])
    for (let t = 0; t <= 1000; t += 13) {
      for (let a = 0; a < 2; a++) expect(evaluateNumericTrack(next.timelines[0].tracks[a], t)).toBeCloseTo(evaluateNumericTrack(scene.timelines[0].tracks[a], t)!, 7)
    }
    expect(next.layers).toBe(scene.layers)
    expect(next.timelines[0].tracks.flatMap(tr => tr.keyframes.map(k => k.id))).toEqual(scene.timelines[0].tracks.flatMap(tr => tr.keyframes.map(k => k.id)))
    expect(change.command!.undo(next)).toEqual(scene)
    const disabled = { ...next, timelines: next.timelines.map(timeline => ({ ...timeline, tracks: timeline.tracks.map(track => ({ ...track,
      keyframes: track.keyframes.map(key => ({ ...key, tangentMode: 'linear' as const })),
    })) })) }
    const enabled = setTrajectoryNodeCurve(disabled, { ...scope, timeMs: 500, mode: 'broken' }).command!.execute(disabled)
    expect(trajectoryCurveHandles(buildTrajectoryModel(enabled, 'active', 'hero').context!, 500)).toHaveLength(2)
  })
  it('Corner Bezier moves only one native control and retains exact timing and the opposite segment', () => {
    const { next } = nodeCurve(), model = buildTrajectoryModel(next, 'active', 'hero')
    const handles = trajectoryCurveHandles(model.context!, 500), out = handles.find(h => h.side === 'out')!
    const edit = moveTrajectoryHandle(next, { ...scope, handle: out, world: { x: out.world.x + 20, y: out.world.y - 30 } })
    const changed = edit.command!.execute(next), after = buildTrajectoryModel(changed, 'active', 'hero')
    const incoming = trajectoryCurveHandles(after.context!, 500).find(h => h.side === 'in')!
    expect(incoming).toEqual(handles.find(h => h.side === 'in'))
    const moved = trajectoryCurveHandles(after.context!, 500).find(h => h.side === 'out')!
    expect(moved.world.x).toBeCloseTo(out.world.x + 20); expect(moved.world.y).toBeCloseTo(out.world.y - 30)
    expect(changed.timelines[0].tracks.map(tr => tr.keyframes.map(k => k.timeMs))).toEqual(next.timelines[0].tracks.map(tr => tr.keyframes.map(k => k.timeMs)))
    expect(edit.command!.undo(changed)).toEqual(next)
  })
  it('aligned controls mirror across the selected anchor and stale handles refuse intervening source edits', () => {
    const { next } = nodeCurve('aligned'), model = buildTrajectoryModel(next, 'active', 'hero'), node = model.nodes.find(n => n.timeMs === 500)!
    const out = trajectoryCurveHandles(model.context!, 500).find(h => h.side === 'out')!
    const edit = moveTrajectoryHandle(next, { ...scope, handle: out, world: { x: out.world.x + 10, y: out.world.y - 30 } })
    const changed = edit.command!.execute(next), after = buildTrajectoryModel(changed, 'active', 'hero')
    const handles = trajectoryCurveHandles(after.context!, 500)
    expect(handles[0].world.x + handles[1].world.x).toBeCloseTo(node.world.x * 2)
    expect(handles[0].world.y + handles[1].world.y).toBeCloseTo(node.world.y * 2)
    expect(() => edit.command!.execute(changed)).toThrow(/changed/)
  })
  it('segment menu changes only the explicit interval, and insertion on a curved path preserves evaluated motion and fractional time', () => {
    const scene = fixture(), change = setTrajectorySegmentEasing(scene, { ...scope, startMs: 0, endMs: 500,
      easing: { type: 'easeIn' } }), next = change.command!.execute(scene)
    expect(next.timelines[0].tracks[0].keyframes[0].easing.type).toBe('easeIn')
    expect(next.timelines[0].tracks[0].keyframes[1]).toEqual(scene.timelines[0].tracks[0].keyframes[1])
    const context = buildTrajectoryModel(next, 'active', 'hero').context!, timeMs = 212.25, sample = projectTrajectoryPosition(context, timeMs)!
    const insert = setTrajectoryPoint(next, { ...scope, timeMs, worldPoint: sample.world }), result = insert.command!.execute(next)
    for (let t = 0; t < 1000; t += 17) for (let a = 0; a < 2; a++) expect(evaluateNumericTrack(result.timelines[0].tracks[a], t)).toBeCloseTo(evaluateNumericTrack(next.timelines[0].tracks[a], t)!, 6)
    expect(result.timelines[0].tracks.every(tr => tr.keyframes.some(k => k.timeMs === timeMs))).toBe(true)
    expect(insert.command!.undo(result)).toEqual(next)
  })
  it('hit testing returns native interval/local time and rejects empty space or stationary samples', () => {
    const model = buildTrajectoryModel(fixture(), 'active', 'hero'), sample = projectTrajectoryPosition(model.context!, 250)!
    expect(hitTrajectory(model, sample.world, 1)).toMatchObject({ startMs: 0, endMs: 500 })
    expect(hitTrajectory(model, { x: -1000, y: -1000 }, 5)).toBeNull()
  })
  it('refuses unrepresentable flat-axis bends rather than silently flattening a control', () => {
    const scene = fixture(); scene.timelines[0].tracks[1].keyframes.forEach(key => { key.value = 0 })
    const change = setTrajectoryNodeCurve(scene, { ...scope, timeMs: 500, mode: 'broken' }), next = change.command!.execute(scene)
    const context = buildTrajectoryModel(next, 'active', 'hero').context!, out = trajectoryCurveHandles(context, 500)[1]
    expect(() => moveTrajectoryHandle(next, { ...scope, handle: out, world: { x: out.world.x, y: out.world.y + 10 } })).toThrow(/Flat Y/)
  })
})

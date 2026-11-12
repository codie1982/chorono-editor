import { describe, expect, it } from 'vitest'
import type { ChronoScene, Keyframe, Layer, Timeline } from '@/lib/types'
import { emptyScene, newRectLayer, newTimeline } from '@/lib/defaults'
import { evaluateTimelines } from '@/lib/evaluator'
import { buildTrajectoryModel, evaluateTrajectoryFrame, prepareTrajectoryContext,
  projectTrajectoryPosition, trajectoryPositionFromWorld } from './index'

/** Native scalar keys retain stable IDs and the caller's specified easing. */
function keys(prefix: string, values: Array<[number, number]>, hold = false): Keyframe[] {
  return values.map(([timeMs, value], index) => ({ id: `${prefix}-${index}`, timeMs, value,
    easing: { type: hold && index === 0 ? 'hold' : 'linear' } }))
}

/** Explicit local authoring timeline plus an ordinary, separately timed parent. */
function fixture(): { scene: ChronoScene; layer: Layer; parent: Layer; timeline: Timeline } {
  const layer = newRectLayer(), parent: Layer = { ...newRectLayer(), id: 'parent', type: 'group', size: undefined }
  layer.id = 'hero'; layer.parentId = parent.id
  layer.transform = { x: 10, y: 0, anchorX: 5, anchorY: -2, rotationDeg: 25, scaleX: -1, scaleY: 2 }
  parent.transform = { x: 100, y: 50, anchorX: 0, anchorY: 0, rotationDeg: 90, scaleX: 2, scaleY: 3 }
  const timeline: Timeline = { ...newTimeline(), id: 'active', durationMs: 1000, loop: true, pingPong: true, loopCount: 2,
    tracks: [
      { target: 'layers.hero.transform.x', keyframes: keys('x', [[0, 10], [1000, 50]]) },
      { target: 'layers.hero.transform.y', keyframes: keys('y', [[0, 0], [500, 30], [1000, 30]]) },
    ] }
  const parents: Timeline = { ...newTimeline(), id: 'parents', durationMs: 2000, loop: true,
    tracks: [{ target: 'layers.parent.transform.x', keyframes: keys('parent-x', [[0, 100], [2000, 300]]) }] }
  return { scene: { ...emptyScene(), layers: [parent, layer], timelines: [timeline, parents] }, layer, parent, timeline }
}

describe('trajectory authoring model and frame', () => {
  it('evaluates an exact local loop/ping-pong endpoint without altering other timeline clocks', () => {
    const { scene, timeline } = fixture(), before = structuredClone(scene)
    const frame = evaluateTrajectoryFrame(scene, timeline.id, 1000)
    expect(frame.get('layers.hero.transform.x')).toBe(50)
    expect(frame.get('layers.parent.transform.x')).toBe(200)
    expect(evaluateTrajectoryFrame(scene, timeline.id, 2000).get('layers.hero.transform.x')).toBe(50)
    expect(evaluateTimelines(scene.timelines, 2000).get('layers.hero.transform.x')).toBe(10)
    expect(scene).toEqual(before)
  })

  it('groups stable x/y refs and projects every key through its own animated parent frame', () => {
    const { scene, layer, timeline } = fixture(), before = structuredClone(scene)
    const model = buildTrajectoryModel(scene, timeline.id, layer.id)
    expect(model.capability.editable).toBe(true)
    expect(model.nodes.map(node => node.timeMs)).toEqual([0, 500, 1000])
    expect(model.nodes[0].keyIds).toEqual(['x-0', 'y-0'])
    expect(model.nodes[1].xKey).toBeUndefined()
    expect(model.nodes[1].yKey).toMatchObject({ id: 'y-1', target: 'layers.hero.transform.y', timeMs: 500, value: 30 })
    expect(model.nodes[0].world.x).toBeCloseTo(106)
    expect(model.nodes[0].world.y).toBeCloseTo(80)
    expect(model.nodes[1].world.x).toBeCloseTo(66)
    expect(model.nodes[1].world.y).toBeCloseTo(120)
    expect(model.nodes[2].world.x).toBeCloseTo(116)
    expect(model.nodes[2].world.y).toBeCloseTo(160)
    const edited = structuredClone(scene)
    edited.timelines[0].tracks[1].keyframes[1].value = 40
    expect(buildTrajectoryModel(edited, timeline.id, layer.id).nodes.map(node => node.id)).toEqual(model.nodes.map(node => node.id))
    expect(scene).toEqual(before)
  })

  it('inverts composition movement at each key time and subtracts the actual local anchor', () => {
    const { scene, layer, timeline } = fixture()
    const prepared = prepareTrajectoryContext(scene, timeline.id, layer.id)
    if (!prepared.ok) throw new Error('Fixture context failed')
    const sample = projectTrajectoryPosition(prepared.context, 1000)!
    const original = trajectoryPositionFromWorld(prepared.context, 1000, sample.world)!
    expect(original.x).toBeCloseTo(50)
    expect(original.y).toBeCloseTo(30)
    const moved = trajectoryPositionFromWorld(prepared.context, 1000, { x: sample.world.x + 12, y: sample.world.y + 8 })!
    expect(moved.x).toBeCloseTo(54)
    expect(moved.y).toBeCloseTo(26)
    const first = projectTrajectoryPosition(prepared.context, 0)!
    expect(trajectoryPositionFromWorld(prepared.context, 0, first.world)?.x).toBeCloseTo(10)
  })

  it('never connects a hold jump with a false continuous line', () => {
    const { scene, layer, timeline } = fixture()
    layer.parentId = undefined
    layer.transform = { ...layer.transform, anchorX: 0, anchorY: 0 }
    timeline.tracks = [
      { target: 'layers.hero.transform.x', keyframes: keys('hold', [[0, 0], [500, 100], [1000, 200]], true) },
      { target: 'layers.hero.transform.y', keyframes: keys('vertical', [[0, 0], [1000, 100]]) },
    ]
    const model = buildTrajectoryModel(scene, timeline.id, layer.id)
    expect(model.segments.length).toBeGreaterThanOrEqual(2)
    expect(model.nodes.find(node => node.timeMs === 500)?.world.x).toBe(100)
    for (const segment of model.segments) {
      for (let i = 1; i < segment.length; i++) {
        expect(segment[i - 1].timeMs < 500 && segment[i].timeMs >= 500).toBe(false)
      }
      for (const sample of segment) {
        if (sample.timeMs < 500) expect(sample.world.x).toBeCloseTo(0)
        else expect(sample.world.x).toBeGreaterThanOrEqual(100)
      }
    }
  })

  it('keeps unkeyed layers editable and shows zero-key controllers as read-only native previews', () => {
    const { scene, layer, timeline } = fixture()
    timeline.tracks = []
    expect(buildTrajectoryModel(scene, timeline.id, layer.id).capability).toMatchObject({ editable: true, kind: 'none' })
    timeline.tracks = [{ target: 'layers.hero.transform.x', keyframes: [], controller: { type: 'waveform', waveform: {
      shape: 'sine', amplitude: 20, frequency: 1, phase: 0, offset: 30, duty: 0.5,
    } } }]
    const model = buildTrajectoryModel(scene, timeline.id, layer.id)
    expect(model.capability).toMatchObject({ editable: false, kind: 'procedural' })
    expect(model.nodes).toEqual([])
    expect(model.segments.flat().length).toBeGreaterThan(2)
    expect(model.capability.diagnostics.some(item => item.code === 'driven-transform')).toBe(true)
    expect(trajectoryPositionFromWorld(model.context!, 500, { x: 1, y: 2 })).toBeNull()
  })

  it('reports inherited locks, source ownership, competing timelines and singular parents without mutations', () => {
    const initial = fixture()
    const cases: Array<[string, (scene: ChronoScene) => void]> = [
      ['locked', scene => { scene.layers[0].locked = true }],
      ['frozen', scene => { scene.layers[0].frozen = true }],
      ['follow-path', scene => { scene.layers[1].followPath = { pathLayerId: 'guide' } }],
      ['inline-motion-path', scene => { scene.layers[1].motionPath = { pathData: 'M0 0 L100 0' } }],
      ['competing-timeline', scene => { scene.timelines[1].tracks.push({ target: 'layers.hero.transform.x', keyframes: keys('other', [[0, 99]]) }) }],
      ['singular-parent', scene => { scene.layers[0].transform.scaleX = 0 }],
      ['driven-transform', scene => { scene.layers[0].paramBindings = { 'transform.x': 'slider' } }],
    ]
    for (const [code, change] of cases) {
      const scene = structuredClone(initial.scene); change(scene); const before = structuredClone(scene)
      const model = buildTrajectoryModel(scene, initial.timeline.id, initial.layer.id)
      expect(model.capability.editable, code).toBe(false)
      expect(model.capability.diagnostics.some(item => item.code === code), code).toBe(true)
      if (code === 'driven-transform' || code === 'competing-timeline') {
        expect(model.capability.previewable, code).toBe(false)
        expect(model.nodes, code).toEqual([])
        expect(model.segments, code).toEqual([])
      }
      expect(scene).toEqual(before)
    }
    expect(buildTrajectoryModel(initial.scene, 'missing', initial.layer.id).context).toBeNull()
    expect(buildTrajectoryModel(initial.scene, initial.timeline.id, 'missing').context).toBeNull()
  })

  it('bounds adaptive/source-node work and reports preview truncation explicitly', () => {
    const { scene, layer, timeline } = fixture(), before = structuredClone(scene)
    const model = buildTrajectoryModel(scene, timeline.id, layer.id, { maxSamples: 16, maxNodes: 2, tolerancePx: 0.01 })
    expect(model.nodes).toHaveLength(2)
    expect(model.segments.flat().length).toBeLessThanOrEqual(16)
    expect(model.capability.editable).toBe(false)
    expect(model.capability.diagnostics.some(item => item.code === 'node-budget')).toBe(true)
    expect(scene).toEqual(before)
  })
})

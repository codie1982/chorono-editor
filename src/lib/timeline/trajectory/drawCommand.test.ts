import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../../defaults'
import type { ChronoScene, Keyframe } from '../../types'
import { evaluateNumericTrack } from '../../evaluator'
import { acquirePortableScene } from '../../export/portable/PortableSceneOutput'
import { OutputResources } from '../../export/resources'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { defaultRuntimeExporter } from '../../export/RuntimeExporter'
import { drawTrajectory } from './commands'
import { evaluateTrajectoryFrame } from './frame'

const scope = { timelineId: 'motion', layerId: 'object' }
function fixture(): ChronoScene {
  return { ...emptyScene(), layers: [{ ...newRectLayer(), id: 'object', transform: {
    x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 3, anchorY: 4,
  } }], timelines: [{ id: 'motion', durationMs: 1000, autoplay: false, loop: false, layerIds: [], tracks: [] }] }
}
const route = { ...scope, startMs: 0, endMs: 1000, distribution: 'equal-time' as const,
  worldPoints: [{ x: 3, y: 4 }, { x: 13, y: 14 }, { x: 43, y: 4 }] }
function key(id: string, timeMs: number, value: number): Keyframe { return { id, timeMs, value, easing: { type: 'linear' }, tangentMode: 'aligned' } }

describe('drawn native trajectory commands', () => {
  it('assigns explicit equal-time points, creates editable x/y keys and restores absent tracks/membership on undo', () => {
    const scene = fixture(), result = drawTrajectory(scene, route), next = result.command!.execute(scene)
    expect(next.timelines[0].tracks).toHaveLength(2)
    expect(next.timelines[0].tracks[0].keyframes.map(value => value.timeMs)).toEqual([0, 500, 1000])
    expect(next.timelines[0].tracks[0].keyframes.map(value => value.value)).toEqual([0, 10, 40])
    expect(next.timelines[0].tracks[1].keyframes.map(value => value.value)).toEqual([0, 10, 0])
    expect(next.timelines[0].layerIds).toEqual(['object'])
    expect(result.selectedIds).toHaveLength(6)
    expect(result.command!.undo(next)).toEqual(scene)
    expect(result.command!.execute(result.command!.undo(next))).toEqual(next)
    expect(next.layers).toBe(scene.layers)
  })

  it('distributes time by composition-space distance rather than point index', () => {
    const scene = fixture(), result = drawTrajectory(scene, { ...route, distribution: 'distance',
      worldPoints: [{ x: 3, y: 4 }, { x: 13, y: 4 }, { x: 43, y: 4 }] })
    const keys = result.command!.execute(scene).timelines[0].tracks[0].keyframes
    expect(keys.map(value => value.timeMs)).toEqual([0, 250, 1000])
    expect(evaluateNumericTrack({ target: 'layers.object.transform.x', keyframes: keys }, 500)).toBeCloseTo(20)
  })

  it('rejects default append collisions and any implicit/unbounded replacement', () => {
    const scene = fixture()
    scene.timelines[0].tracks = [{ target: 'layers.object.transform.x', keyframes: [key('manual', 500, 90)] }]
    const before = structuredClone(scene)
    expect(() => drawTrajectory(scene, route)).toThrow(/Append/)
    expect(() => drawTrajectory(scene, { ...route, mode: 'replace-range' })).toThrow(/selected/)
    expect(() => drawTrajectory(scene, { ...route, mode: 'replace-range', replaceRange: { startMs: 100, endMs: 900 } })).toThrow(/inside/)
    expect(scene).toEqual(before)
  })

  it('replaces only the explicit position-key range, retaining outside records, matching IDs and all other settings', () => {
    const scene = fixture(), outsideStart = key('outside-start', 0, 5), outsideEnd = key('outside-end', 1000, 30)
    const existing = { ...key('inside-start', 200, 10), easing: { type: 'easeOut' as const } }
    const opacity = { target: 'layers.object.opacity', keyframes: [key('opacity', 400, 0.3)] }
    const x = { target: 'layers.object.transform.x', label: 'Manual X', outOfRange: { before: 'constant' as const, after: 'constant' as const },
      keyframes: [outsideStart, existing, key('inside-old', 500, 90), outsideEnd] }
    scene.timelines[0].tracks = [x, opacity]
    const result = drawTrajectory(scene, { ...route, startMs: 200, endMs: 800, mode: 'replace-range',
      replaceRange: { startMs: 200, endMs: 800 }, worldPoints: [{ x: 23, y: 4 }, { x: 33, y: 14 }] })
    const next = result.command!.execute(scene), track = next.timelines[0].tracks[0]
    expect(track.keyframes[0]).toBe(outsideStart)
    expect(track.keyframes[track.keyframes.length - 1]).toBe(outsideEnd)
    expect(track.keyframes.find(value => value.id === 'inside-start')).toEqual({ ...existing, value: 20 })
    expect(track.keyframes.some(value => value.id === 'inside-old')).toBe(false)
    expect(track.label).toBe('Manual X')
    expect(track.outOfRange).toBe(x.outOfRange)
    expect(next.timelines[0].tracks[1]).toBe(opacity)
    expect(result.diagnostics.join(' ')).toMatch(/200–800.*adjacent/i)
    expect(result.command!.undo(next)).toEqual(scene)
  })

  it('refuses a replacement collision with a protected key just outside the selected range', () => {
    const scene = fixture()
    scene.timelines[0].tracks = [{ target: 'layers.object.transform.x', keyframes: [key('outside', 199.5, 5)] }]
    const before = structuredClone(scene)
    expect(() => drawTrajectory(scene, { ...route, startMs: 200, endMs: 800, mode: 'replace-range',
      replaceRange: { startMs: 200, endMs: 800 }, worldPoints: [{ x: 23, y: 4 }, { x: 33, y: 14 }] })).toThrow(/outside/)
    expect(scene).toEqual(before)
  })

  it('bounds routes and refuses zero-time/colliding timestamp schedules before any source write', () => {
    const scene = fixture()
    expect(() => drawTrajectory(scene, { ...route, worldPoints: Array.from({ length: 129 }, (_, i) => ({ x: i, y: i })) })).toThrow(/128/)
    expect(() => drawTrajectory(scene, { ...route, startMs: 500, endMs: 500 })).toThrow(/increasing/)
    expect(() => drawTrajectory(scene, { ...route, startMs: 0, endMs: 2 })).toThrow(/1 ms/)
    expect(scene.timelines[0].tracks).toEqual([])
  })

  it('keeps real native values through portable save/load and runtime export evaluation', async () => {
    const original = fixture(), result = drawTrajectory(original, route), scene = result.command!.execute(original)
    const owner = new OutputResources(), lease = await acquirePortableScene(scene, { resources: owner })
    try {
      const loaded = parseSceneJson(JSON.stringify(lease.value), true)
      expect(loaded.timelines[0].tracks.flatMap(track => track.keyframes.map(value => value.id))).toEqual(scene.timelines[0].tracks.flatMap(track => track.keyframes.map(value => value.id)))
      const exported = defaultRuntimeExporter.export(loaded)
      expect(exported.warnings).toEqual([])
      const runtimeScene: ChronoScene = { ...exported.runtime, assets: loaded.assets, initialState: loaded.initialState }
      for (const timeMs of [0, 250, 500, 750, 1000]) {
        const sourceFrame = evaluateTrajectoryFrame(scene, 'motion', timeMs)
        const loadedFrame = evaluateTrajectoryFrame(loaded, 'motion', timeMs)
        const runtimeFrame = evaluateTrajectoryFrame(runtimeScene, 'motion', timeMs)
        for (const axis of ['x', 'y']) {
          const target = `layers.object.transform.${axis}`
          expect(loadedFrame.get(target)).toBeCloseTo(sourceFrame.get(target) as number)
          expect(runtimeFrame.get(target)).toBeCloseTo(sourceFrame.get(target) as number)
        }
      }
    } finally { lease.release(); owner.dispose() }
    expect(owner.getSnapshot().residency.chargedBytes).toBe(0)
  })
})

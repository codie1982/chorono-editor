import { describe, expect, it } from 'vitest'
import { emptyScene, newSplineLayerFromData } from '../../defaults'
import { createCircleSpline } from '../../spline'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { makePickBooleanCmd } from './pickOperation'
import { materializeSplineBoolean, makeCollapseBooleanPathsCmd } from './materializeSplineBoolean'

/** Stroke-only input paint is independent of the closed-area calculation. */
function fixture() {
  return { ...emptyScene(), layers: [0, 60].map((x, i) => ({ ...newSplineLayerFromData(createCircleSpline({ radius: 50 }), { x, y: 80 }), id: `circle-${i}` })) }
}
describe('integrated spline Boolean materialization', () => {
  it('solves and merges in one Undo with an editable selected spline and detached source ghosts', () => {
    const scene = fixture(), saved = structuredClone(scene)
    const plan = materializeSplineBoolean(scene, makePickBooleanCmd(scene, 'circle-0', 'circle-1', 'union')!, 'circle-0')
    const next = plan.command.execute(scene), result = next.layers.find(layer => layer.id === plan.layerId)!
    expect(next.layers).toHaveLength(1); expect(result.type).toBe('spline')
    expect(result.booleanOperation).toBeUndefined(); expect(result.booleanResultFor).toBeUndefined()
    expect(Object.values(result.spline!.subShapes).every(object => object.editable)).toBe(true)
    expect(result.style).toEqual(scene.layers[0].style)
    expect(plan.ghosts).toHaveLength(2); expect(plan.ghosts.every(ghost => ghost.path.includes('C'))).toBe(true)
    expect(plan.command.undo(next)).toBe(scene); expect(plan.command.execute(scene)).toBe(next)
    expect(() => plan.command.execute({ ...scene })).toThrow(/changed/)
    expect(scene).toEqual(saved)
    expect(parseSceneJson(JSON.stringify(next)).layers[0].type).toBe('spline')
  })
  it('removes an exhausted source after its final Object is consumed', () => {
    const scene = fixture(), target = scene.layers[0], source = scene.layers[1]
    const sourceObjectId = Object.keys(source.spline!.subShapes)[0]
    const command = makePickBooleanCmd(scene, target.id, source.id, 'union', 0, new Map(), { sourceObjectId })!
    const plan = materializeSplineBoolean(scene, command, target.id), next = plan.command.execute(scene)
    expect(next.layers).toHaveLength(1)
    expect(next.layers[0].id).toBe(plan.layerId)
    expect(plan.command.undo(next)).toBe(scene)
  })
  it('Merge turns the existing parent itself into a spline and removes the generated child', () => {
    const initial = fixture(), scene = makePickBooleanCmd(initial, 'circle-0', 'circle-1', 'xor')!.execute(initial)
    const parent = scene.layers.find(layer => layer.booleanOperation)!, childId = parent.booleanOperation!.resultLayerId
    const plan = makeCollapseBooleanPathsCmd(scene, parent.id), next = plan.command.execute(scene)
    expect(plan.layerId).toBe(parent.id)
    expect(next.layers.find(layer => layer.id === parent.id)?.type).toBe('spline')
    expect(next.layers.some(layer => layer.id === childId || layer.parentId === parent.id)).toBe(false)
    expect(plan.command.undo(next)).toBe(scene)
  })
  it('retains parent animation, refuses to discard generated-child readers, and never mutates a rejected source', () => {
    const initial = fixture(), scene = makePickBooleanCmd(initial, 'circle-0', 'circle-1', 'union')!.execute(initial)
    const owner = scene.layers.find(layer => layer.booleanOperation)!, resultId = owner.booleanOperation!.resultLayerId
    const timeline = { id: 'main', durationMs: 1000, autoplay: false, loop: false,
      tracks: [{ target: `layers.${owner.id}.transform.x`, keyframes: [{ id: 'keep', timeMs: 0, value: 10, easing: { type: 'linear' as const } }] }] }
    const animated = { ...scene, timelines: [timeline] }, next = makeCollapseBooleanPathsCmd(animated, owner.id).command.execute(animated)
    expect(next.timelines[0].tracks).toEqual(timeline.tracks)
    const keyedChild = { ...scene, timelines: [{ ...timeline, tracks: [{ ...timeline.tracks[0], target: `layers.${resultId}.transform.x` }] }] }
    const saved = structuredClone(keyedChild)
    expect(() => makeCollapseBooleanPathsCmd(keyedChild, owner.id)).toThrow(/readers|animation/)
    expect(keyedChild).toEqual(saved)
  })
})

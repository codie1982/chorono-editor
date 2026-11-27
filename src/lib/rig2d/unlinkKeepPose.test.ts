import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import type { ChronoScene, Layer, Track } from '../types'
import { resolveWorldMatrix } from '../geometry/evaluatedWorldMatrix'
import { evaluateSceneFrame } from '../runtime/evaluateSceneFrame'
import { makePivotCommand } from './commands'
import { makeUnlinkKeepPoseCommand } from './unlinkKeepPose'

/** Distinct pivots inside a rotated, nonuniformly reflected group. */
function fixture() {
  const part = (id: string, x: number, angle = 0): Layer => {
    const layer = newRectLayer()
    return { ...layer, id, parentId: 'group', transform: { ...layer.transform, x, y: 20,
      rotationDeg: angle, anchorX: 4, anchorY: 7 } }
  }
  const group: Layer = { ...part('group', 80, 60), parentId: undefined, type: 'group' }
  group.transform.scaleX = -2
  const rig: ChronoScene = { ...emptyScene(), layers: [group, part('driver', 12), part('part', 60, 720),
    part('tip', 100), part('base', 3)], timelines: [] }
  return makePivotCommand(rig, 'part', { kind: 'link', driverId: 'driver' }).execute(rig)
}
const layer = (scene: ChronoScene, id: string) => scene.layers.find(item => item.id === id)!
const clock = { timelineId: 'motion', localTimeMs: 500 }
const frame = (scene: ChronoScene) => evaluateSceneFrame(scene, 500, { externalTime: clock })
const detach = (scene: ChronoScene, id = 'part') => makeUnlinkKeepPoseCommand(scene, layer(scene, id), frame(scene), clock)
const matrix = (scene: ChronoScene, id: string) => resolveWorldMatrix(layer(scene, id), scene, 500, frame(scene).overrides).toArray()
function sameWorld(a: ChronoScene, b: ChronoScene, id: string) {
  matrix(a, id).forEach((value, index) => expect(matrix(b, id)[index]).toBeCloseTo(value, 8))
}
function track(target: string, a: number, b: number): Track {
  return { target: 'layers.' + target, keyframes: [a, b].map((value, i) => ({
    id: target + i, timeMs: i * 500, easing: { type: 'linear' }, value })) }
}
describe('unlink at the displayed pose', () => {
  it('preserves projected geometry and authored turns at the paused loop end, with one reversible key/base edit', () => {
    const scene = fixture()
    const tl = { ...newTimeline(), id: 'motion', durationMs: 500, loop: true,
      tracks: [track('driver.transform.rotationDeg', 0, 90), track('driver.transform.y', 20, 45),
        track('part.transform.x', 60, 75), track('part.transform.anchorX', 4, 12)] }
    scene.timelines = [tl]
    const command = detach(scene), after = command.execute(scene)
    expect(layer(after, 'part').pivotLink2d).toBeUndefined()
    sameWorld(scene, after, 'part')
    expect(layer(after, 'part').transform).toMatchObject({ rotationDeg: 810, anchorX: 4, anchorY: 7, x: 60 })
    expect(after.timelines[0].tracks[2].keyframes[1]).toEqual({ ...tl.tracks[2].keyframes[1], value: expect.closeTo(4, 9) })
    expect(after.timelines[0].tracks[3]).toBe(tl.tracks[3])
    expect(command.undo(after)).toEqual(scene)
    expect(command.execute(command.undo(after))).toEqual(after)
    const moved = { ...after, layers: after.layers.map(l => l.id === 'driver' ? { ...l, transform: { ...l.transform, x: 500 } } : l) }
    sameWorld(after, moved, 'part')
  })
  it('captures the solved lower joint and restores its required IK in the same Undo', () => {
    let scene = fixture()
    scene = makePivotCommand(scene, 'driver', { kind: 'ik', lowerId: 'part', targetId: 'tip' }).execute(scene)
    layer(scene, 'tip').transform.y += 46
    const command = detach(scene), after = command.execute(scene)
    sameWorld(scene, after, 'part')
    expect(layer(after, 'driver').twoBoneIK2d).toBeUndefined()
    expect(command.undo(after)).toEqual(scene)
  })
  it('keeps an upper joint solving with its locked shoulder in the new axes', () => {
    let scene = fixture()
    scene = makePivotCommand(scene, 'driver', { kind: 'link', driverId: 'base' }).execute(scene)
    scene = makePivotCommand(scene, 'driver', { kind: 'ik', lowerId: 'part', targetId: 'tip' }).execute(scene)
    scene = makePivotCommand(scene, 'driver', { kind: 'setJointLimit', joint: 'shoulder',
      limit: { enabled: true, minDeg: -20, maxDeg: 35, lockedDeg: 25 } }).execute(scene)
    layer(scene, 'base').transform.rotationDeg = 40
    const command = detach(scene, 'driver'), after = command.execute(scene)
    sameWorld(scene, after, 'driver'); sameWorld(scene, after, 'part')
    expect(layer(after, 'driver').twoBoneIK2d?.shoulderLimit?.lockedDeg).toBe(65)
    expect(command.undo(after)).toEqual(scene)
  })
  it('rejects locked ancestors and competing writers before touching the link', () => {
    const scene = fixture()
    layer(scene, 'group').frozen = true
    expect(() => detach(scene)).toThrow(/unfreeze/)
    layer(scene, 'group').frozen = false
    layer(scene, 'driver').transform.x += 10
    layer(scene, 'part').paramBindings = { 'transform.x': 'slider' }
    expect(() => detach(scene)).toThrow(/driven/)
    expect(layer(scene, 'part').pivotLink2d?.driverId).toBe('driver')
  })
})

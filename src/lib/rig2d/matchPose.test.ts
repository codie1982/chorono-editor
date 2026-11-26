import { expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import { distance, wrapAngle180 } from '../geometry/CoordinateSystem'
import { evaluateSceneFrame } from '../runtime/evaluateSceneFrame'
import { makePivotCommand } from './commands'
import { makeRigWeightCommand, type RigWeightAction } from './matchPose'
import { readJoint } from './pose'
import type { ChronoScene } from '../types'

const clock = { timelineId: 'motion', localTimeMs: 500 }
const at = (scene: ChronoScene, time = 500) => evaluateSceneFrame(scene, time, { externalTime: { ...clock, localTimeMs: time } })
const solve = (scene: ChronoScene, time = 500) => {
  const chain = at(scene, time).ikDiagnostics.get('a')!
  if (chain.status === 'inactive') throw Error(chain.reason)
  return chain
}
const cmd = (scene: ChronoScene, action: RigWeightAction, auto = false) =>
  makeRigWeightCommand(scene, scene.layers[0], action, at(scene), clock, 500, auto)

function arm(): ChronoScene {
  const layers = ['a', 'b', 'target', 'driver'].map((id, i) => {
    const layer = newRectLayer()
    return { ...layer, id, transform: { ...layer.transform, x: i * 40, y: 20, anchorX: 5, anchorY: -7, rotationDeg: 720 } }
  })
  let scene: ChronoScene = { ...emptyScene(), layers, timelines: [{ ...newTimeline(), id: 'motion', durationMs: 1000 }] }
  scene = makePivotCommand(scene, 'a', { kind: 'link', driverId: 'driver' }).execute(scene)
  scene = makePivotCommand(scene, 'b', { kind: 'link', driverId: 'a' }).execute(scene)
  scene = makePivotCommand(scene, 'a', { kind: 'ik', lowerId: 'b', targetId: 'target' }).execute(scene)
  return { ...scene, layers: scene.layers.map(l => l.id === 'target' ? { ...l, transform: { ...l.transform, x: 41, y: 37 } } : l) }
}

function samePose(a: ChronoScene, b: ChronoScene, time = 500) {
  const p = solve(a, time), q = solve(b, time)
  for (const key of ['shoulder', 'elbow', 'tip'] as const) expect(distance(p.composition[key], q.composition[key])).toBeLessThan(1e-7)
  for (const i of [0, 1]) {
    const read = (s: ChronoScene) => readJoint(s.layers[i], at(s, time).overrides).angle
    expect(wrapAngle180(read(a) - read(b))).toBeCloseTo(0, 7)
  }
}

it('blends the two local angles, retains link lengths, and ignores a moving goal at zero influence', () => {
  const ik = arm(), fk = cmd(ik, { kind: 'setWeight', weight: 0 }).execute(ik)
  const half = cmd(fk, { kind: 'setWeight', weight: 0.5 }).execute(fk)
  const original = solve(fk), mid = solve(half), full = solve(ik)
  expect(mid.weight).toBe(0.5)
  for (const joint of ['shoulder', 'elbow'] as const)
    expect(mid.angles[joint] - original.angles[joint]).toBeCloseTo(wrapAngle180(full.angles[joint] - original.angles[joint]) / 2, 7)
  expect(distance(mid.local.shoulder, mid.local.elbow)).toBeCloseTo(40, 9)
  expect(distance(mid.local.elbow, mid.local.tip)).toBeCloseTo(40, 9)
  samePose(fk, { ...fk, layers: fk.layers.map(l => l.id === 'target' ? { ...l, transform: { ...l.transform, x: -300 } } : l) })
})

it.each([727, 750])('matches both ways under a %s° driver, keys this frame, and restores source in one Undo', rotationDeg => {
  const rig = arm()
  rig.layers[3] = { ...rig.layers[3], transform: { ...rig.layers[3].transform, rotationDeg } }
  const partial = cmd(rig, { kind: 'setWeight', weight: 0.4 }).execute(rig)
  for (const kind of ['matchFK', 'matchIK'] as const) {
    const command = cmd(partial, { kind }, true), next = command.execute(partial)
    expect(solve(next).weight).toBe(Number(kind === 'matchIK'))
    samePose(next, partial)
    samePose(next, partial, 0)
    expect(next.timelines[0].tracks.find(t => t.target === 'layers.a.twoBoneIK2d.weight')!.keyframes.map(k => k.timeMs)).toEqual([0, 500])
    expect(command.undo(next)).toEqual(partial)
    expect(command.execute(command.undo(next))).toEqual(next)
    samePose(JSON.parse(JSON.stringify(next)), next)
  }
})

it('rejects an impossible FK to IK match and locked target without changing source', () => {
  const rig = arm(), fk = cmd(rig, { kind:'matchFK' }).execute(rig)
  const limit = makePivotCommand(fk, 'a', { kind:'setJointLimit', joint:'elbow', limit:{ enabled:true, minDeg:0, maxDeg:0 } }).execute(fk)
  const saved = JSON.stringify(limit)
  expect(() => cmd(limit, { kind:'matchIK' })).toThrow(/limits/)
  expect(JSON.stringify(limit)).toBe(saved)
  const locked = { ...fk, layers: fk.layers.map(l => l.id === 'target' ? { ...l, locked:true, transform:{ ...l.transform, x: 34 } } : l) }
  expect(() => cmd(locked, { kind:'matchIK' })).toThrow(/Unlock/)
})

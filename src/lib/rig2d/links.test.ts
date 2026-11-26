import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../defaults'
import type { ChronoScene, Layer } from '../types'
import type { OverrideMap } from '../evaluator'
import { makeCloneForestCmd } from '../editor/commands-clone-forest'
import { makeDeleteLayersCmd } from '../editor/commands-layer'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'
import { evaluateSceneFrame } from '../runtime/evaluateSceneFrame'
import { RuntimeSceneCompiler } from '../export/runtime/RuntimeSceneCompiler'
import { ChronoPlayer } from '../player/ChronoPlayer'
import { makePivotCommand, type LinkAction } from './commands'
import { readJoint, rotate } from './pose'

function part(id: string, x: number, y = 0): Layer {
  const source = newRectLayer()
  return { ...source, id, name: id, transform: { ...source.transform, x, y, anchorX: 0, anchorY: 0 } }
}
function act(scene: ChronoScene, id: string, action: LinkAction) {
  return makePivotCommand(scene, id, action).execute(scene)
}
function fixture() {
  const base = { ...emptyScene(), layers: [part('lower',30), part('tip',50), part('upper',0), part('glove',50)] }
  const linked = act(base, 'lower', { kind: 'link', driverId: 'upper' })
  const hand = act(linked, 'glove', { kind: 'link', driverId: 'lower' })
  return { base, linked, ik: act(hand, 'upper', { kind: 'ik', lowerId: 'lower', targetId: 'tip' }) }
}
function pose(scene: ChronoScene, id: string, values: OverrideMap) {
  return readJoint(scene.layers.find(layer => layer.id === id)!, values)
}
function near(actual: {x: number; y: number}, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x, 7)
  expect(actual.y).toBeCloseTo(y, 7)
}

describe('sibling pivot links and two-bone IK', () => {
  it('preserves the bind pose and rotates the follower around an animated pivot', () => {
    const { linked } = fixture()
    const values = evaluateSceneFrame(linked, 0, { baseOverrides: new Map([['layers.upper.transform.rotationDeg',90],['layers.upper.transform.anchorX',5]]) }).overrides
    near(pose(linked,'lower',values).pivot,5,30)
    expect(pose(linked,'lower',values).angle).toBeCloseTo(90)
    expect(linked.layers[0].transform.x).toBe(30)
  })
  it('reaches an animated target, flips bend in one undo and carries downstream followers', () => {
    const { ik } = fixture(), before = JSON.stringify(ik)
    const target = new Map([['layers.tip.transform.x',30],['layers.tip.transform.y',20]])
    const frame = (s: ChronoScene) => evaluateSceneFrame(s, 570, { baseOverrides: target }).overrides
    const flip = makePivotCommand(ik,'upper',{ kind:'flip' }), flipped = flip.execute(ik)
    for (const scene of [ik, flipped, flip.undo(flipped)]) {
      const values = frame(scene), elbow = pose(scene,'lower',values)
      near(pose(scene,'glove',values).pivot,30,20)
      expect(Math.hypot(elbow.pivot.x,elbow.pivot.y)).toBeCloseTo(30)
      expect(Math.sign(30*elbow.pivot.y-20*elbow.pivot.x)).toBe(scene.layers[2].twoBoneIK2d!.bend)
    }
    expect(JSON.stringify(ik)).toBe(before)
    expect(target.size).toBe(2)
  })
  it('clamps both ends of the reach interval and folds equal segments at the root', () => {
    const { ik } = fixture()
    for (const [target, end] of [[100,50],[2,10],[0,10],[-100,-50]]) {
      const values = evaluateSceneFrame(ik,0,{baseOverrides:new Map([['layers.tip.transform.x',target]])}).overrides
      near(pose(ik,'glove',values).pivot,end,0)
    }
    const equal = { ...ik, layers: ik.layers.map(l => l.twoBoneIK2d ? { ...l, twoBoneIK2d:{...l.twoBoneIK2d,tip:{x:30,y:0}} } : l) }
    const frame = evaluateSceneFrame(equal,0,{baseOverrides:new Map([['layers.tip.transform.x',0]])}).overrides
    const elbow = pose(equal,'lower',frame), v = rotate({x:30,y:0},elbow.angle)
    near({x:elbow.pivot.x+v.x,y:elbow.pivot.y+v.y},0,0)
  })
  it('captures the live shoulder offset, restores it at a folded root and round-trips it in one Undo', () => {
    const { ik } = fixture()
    const equal = { ...ik, layers: ik.layers.map(l => l.twoBoneIK2d
      ? { ...l, twoBoneIK2d: { ...l.twoBoneIK2d, tip: { x: 30, y: 0 } } } : l) }
    const at = (source: ChronoScene, x: number, y = 0) => evaluateSceneFrame(source, 400, {
      baseOverrides: new Map([['layers.tip.transform.x', x], ['layers.tip.transform.y', y]]),
    })
    // The evaluated target (30,30) differs from its authored position (50,0).
    const live = at(equal, 30, 30)
    const prefer = makePivotCommand(equal, 'upper', { kind: 'preferPose' }, 400, live.overrides, live.ikDiagnostics)
    const preferred = prefer.execute(equal)
    expect(preferred.layers[2].twoBoneIK2d!.preferredShoulderOffsetDeg).toBeCloseTo(90)
    const saved = parseSceneJson(JSON.stringify(preferred), true)
    for (const scene of [preferred, saved, prefer.execute(prefer.undo(preferred))]) {
      const values = at(scene, 0).overrides
      near(pose(scene, 'lower', values).pivot, 0, 30)
      expect(pose(scene, 'upper', values).angle).toBeCloseTo(90)
    }
    near(pose(equal, 'lower', at(prefer.undo(preferred), 0).overrides).pivot, 30, 0)
    const clear = makePivotCommand(saved, 'upper', { kind: 'clearPreference' })
    const cleared = clear.execute(saved)
    expect(cleared.layers[2].twoBoneIK2d!.preferredShoulderOffsetDeg).toBeUndefined()
    near(pose(cleared, 'lower', at(cleared, 0).overrides).pivot, 30, 0)
    expect(clear.undo(cleared)).toEqual(saved)
  })

  it.each([1, -1] as const)('keeps bend %s when leaving either reach boundary under a reflected, rotated group', bend => {
    const { ik } = fixture()
    const group: Layer = { ...part('parent', 90), type: 'group' }
    group.transform = { ...group.transform, rotationDeg: 90, scaleX: -2, scaleY: 2 }
    const scene = { ...ik, layers: [group, ...ik.layers.map(l => ({ ...l, parentId: group.id,
      ...(l.twoBoneIK2d && { twoBoneIK2d: { ...l.twoBoneIK2d, bend, preferredShoulderOffsetDeg: 55 } }) }))] }
    // Scrub out of order, including the opposite direction and both exact tangencies.
    for (const x of [49.99, 50, 49.99, 10, 10.01, -49.99, -50, -49.99, 10.01]) {
      const state = evaluateSceneFrame(scene, 1000 - x, { baseOverrides: new Map([['layers.tip.transform.x', x]]) }).ikDiagnostics.get('upper')!
      if (state.status === 'inactive') throw Error(state.reason)
      const p = state.local, world = state.composition
      expect(p.distance).toBeLessThan(1e-8)
      if (Math.abs(x) === 50 || x === 10) expect(p.elbow.y).toBeCloseTo(0, 10)
      else {
        expect(Math.sign(x * p.elbow.y)).toBe(bend)
        const cross = (world.target.x - world.shoulder.x) * (world.elbow.y - world.shoulder.y)
          - (world.target.y - world.shoulder.y) * (world.elbow.x - world.shoulder.x)
        expect(Math.sign(cross)).toBe(-bend)
      }
    }
  })

  it.each([1, -1] as const)('returns the limiting angle on each side of a half-turn for bend %s', bend => {
    const { ik } = fixture()
    const scene = { ...ik, layers: ik.layers.map(l => l.twoBoneIK2d ? { ...l, twoBoneIK2d: { ...l.twoBoneIK2d, bend } } : l) }
    for (const [id, inside, tangent] of [['lower', 10.00001, 10], ['upper', -49.99999, -50], ['lower', -49.99999, -50]] as const) {
      const rotation = (x: number) => pose(scene, id, evaluateSceneFrame(scene, 0, {
        baseOverrides: new Map([['layers.tip.transform.x', x]]),
      }).overrides).angle
      expect(Math.abs(rotation(inside) - rotation(tangent))).toBeLessThan(0.2)
    }
  })

  it('keeps both artwork rotations on their authored turns', () => {
    const { base } = fixture()
    const turns = { ...base, layers: base.layers.map(l => ({ ...l, transform: { ...l.transform,
      rotationDeg: l.id === 'upper' ? 720 : l.id === 'lower' ? -1080 : 0 } })) }
    const linked = act(turns, 'lower', { kind: 'link', driverId: 'upper' })
    const rig = act(linked, 'upper', { kind: 'ik', lowerId: 'lower', targetId: 'tip' })
    const overrides = evaluateSceneFrame(rig, 0).overrides
    expect(pose(rig, 'upper', overrides).angle).toBeCloseTo(720)
    expect(pose(rig, 'lower', overrides).angle).toBeCloseTo(-1080)
  })

  it('keeps invalid saved preferences inactive and rejects capture on an inactive frame', () => {
    const { ik } = fixture()
    const corrupt = { ...ik, layers: ik.layers.map(l => l.twoBoneIK2d
      ? { ...l, twoBoneIK2d: { ...l.twoBoneIK2d, preferredShoulderOffsetDeg: Infinity } } : l) }
    expect(evaluateSceneFrame(corrupt, 0).ikDiagnostics.get('upper')).toMatchObject({ status: 'inactive' })
    expect(() => makePivotCommand(corrupt, 'upper', { kind: 'preferPose' })).toThrow(/active IK chain/)
    const repaired = act(corrupt, 'upper', { kind: 'clearPreference' })
    expect(evaluateSceneFrame(repaired, 0).ikDiagnostics.get('upper')?.status).toBe('reached')
  })

  it('retains a rotated, mirrored lower segment and off-axis tip at bind', () => {
    const { linked } = fixture()
    const base = { ...linked,layers:linked.layers.map(l => l.id === 'lower' ? {...l,transform:{...l.transform,rotationDeg:25,scaleX:-2,scaleY:0.7}} :
      l.id === 'tip' ? {...l,transform:{...l.transform,y:-15}} : l) }
    const ik = act(base,'upper',{kind:'ik',lowerId:'lower',targetId:'tip'})
    const frame = evaluateSceneFrame(ik,0).overrides
    const elbow = pose(ik,'lower',frame)
    near(elbow.pivot,30,0)
    expect(Math.cos(elbow.angle*Math.PI/180)).toBeCloseTo(Math.cos(25*Math.PI/180))
    const tip = ik.layers[2].twoBoneIK2d!.tip, v = rotate({x:tip.x*elbow.sx,y:tip.y*elbow.sy},elbow.angle)
    near({x:elbow.pivot.x+v.x,y:elbow.pivot.y+v.y},50,-15)
  })
  it('rejects cyclic, dependent-target, locked, cross-group and degenerate bindings', () => {
    const { linked } = fixture()
    expect(() => act(linked,'upper',{kind:'link',driverId:'lower'})).toThrow(/cycle/)
    const cycle = act(linked,'tip',{kind:'link',driverId:'lower'})
    expect(() => act(cycle,'upper',{kind:'ik',lowerId:'lower',targetId:'tip'})).toThrow(/cycle/)
    for (const change of [{parentId:'g'}, {locked:true}]) {
      const scene = {...linked,layers:linked.layers.map(l => l.id === 'tip' ? {...l,...change} : l)}
      expect(() => act(scene,'tip',{kind:'link',driverId:'upper'})).toThrow()
    }
    const zero = {...linked,layers:linked.layers.map(l => l.id === 'tip' ? {...l,transform:{...l.transform,x:30}} : l)}
    expect(() => act(zero,'upper',{kind:'ik',lowerId:'lower',targetId:'tip'})).toThrow(/distinct/)
  })
  it('keeps unrelated links editable when an endpoint has moved to another group', () => {
    const { linked } = fixture()
    const regrouped = {...linked, layers:linked.layers.map(l=>l.id === 'upper' ? {...l,parentId:'moved'} : l)}
    const next = act(regrouped,'glove',{kind:'link',driverId:'tip'})
    expect(next.layers[3].pivotLink2d?.driverId).toBe('tip')
    expect(act(next,'lower',{kind:'unlink'}).layers[0].pivotLink2d).toBeUndefined()
  })
  it('round-trips editable sources, compiles player poses, and cleans references atomically', () => {
    const { ik } = fixture()
    const source = {...ik,layers:ik.layers.map(l => l.id === 'tip' ? {...l,transform:{...l.transform,x:30,y:20}} : l)}
    const saved = parseSceneJson(JSON.stringify(source),true)
    const frame = evaluateSceneFrame(saved,0).overrides
    near(pose(saved,'glove',frame).pivot,30,20)
    const runtime = new RuntimeSceneCompiler().compile(saved)
    expect(new ChronoPlayer(runtime).tick(0).overrides).toEqual(frame)
    const deletion = makeDeleteLayersCmd(['upper']), next = deletion.execute(saved)
    expect(next.layers[0].pivotLink2d).toBeUndefined()
    expect(deletion.undo(next)).toBe(saved)
    expect(makeDeleteLayersCmd(['tip']).execute(saved).layers[1].twoBoneIK2d).toBeUndefined()
    const unlinked = act(saved,'lower',{kind:'unlink'})
    expect(unlinked.layers[2].twoBoneIK2d).toBeUndefined()
    const copy = makeCloneForestCmd(saved,{sourceIds:saved.layers.map(l=>l.id)})
    const cloned = copy.execute(saved), ids = copy.idMaps[0]
    expect(cloned.layers.find(l=>l.id===ids.upper)?.twoBoneIK2d?.targetId).toBe(ids.tip)
    near(pose(cloned,ids.glove,evaluateSceneFrame(cloned,0).overrides).pivot,30,20)
    const offsets = Object.fromEntries(saved.layers.map(l => [l.id,{x:100,y:80}]))
    const shifted = makeCloneForestCmd(saved,{sourceIds:Object.keys(offsets),offsets})
    const moved = shifted.execute(saved)
    near(pose(moved,shifted.idMaps[0].glove,evaluateSceneFrame(moved,0).overrides).pivot,130,100)
  })
})

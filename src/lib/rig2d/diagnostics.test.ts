import { describe, expect, it } from 'vitest'
import { RuntimeSceneCompiler } from '../export/runtime/RuntimeSceneCompiler'
import { ChronoPlayer } from '../player/ChronoPlayer'
import { newGroupLayer } from '../registry/definitions/scene/GroupDefinition'
import { emptyScene, newRectLayer } from '../defaults'
import { evaluateSceneFrame } from '../runtime/evaluateSceneFrame'
import type { ChronoScene } from '../types'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'
import { selectedIKDiagnostics } from './diagnostics'
import { makePivotCommand } from './commands'

function chain() {
  const layers = [['arm', 0], ['forearm', 120], ['goal', 210]].map(([id, x]) => {
    const layer = newRectLayer()
    return { ...layer, id: String(id), transform: { ...layer.transform, x: Number(x), y: 0, anchorX: 0, anchorY: 0 } }
  })
  let scene: ChronoScene = { ...emptyScene(), layers }
  scene = makePivotCommand(scene, 'forearm', { kind: 'link', driverId: 'arm' }).execute(scene)
  return makePivotCommand(scene, 'arm', { kind: 'ik', lowerId: 'forearm', targetId: 'goal' }).execute(scene)
}

function solve(scene: ChronoScene, x: number, y = 0, dragX?: number) {
  const frame = evaluateSceneFrame(scene, 123.5, {
    baseOverrides: new Map([['layers.goal.transform.x', x], ['layers.goal.transform.y', y]]),
    rigDragOverrides: dragX === undefined ? undefined : new Map([['layers.goal.transform.x', dragX]]),
  })
  const state = frame.ikDiagnostics.get('arm')!
  if (state.status === 'inactive') throw Error(state.reason)
  return state
}

describe('two-bone IK frame measurements', () => {
  it.each([
    [250, 210, 40, 'extended'], [10, 30, 20, 'folded'],
    [210, 210, 0, 'reached'], [210.015, 210, 0.015, 'reached'], [210.03, 210, 0.03, 'extended'],
  ])('measures the solved tip against the unclamped target at %s px', (goal, tip, gap, status) => {
    const state = solve(chain(), Number(goal))
    expect(state.status).toBe(status)
    expect(state.local.tip.x).toBeCloseTo(Number(tip), 8)
    expect(state.local.target.x).toBe(goal)
    expect(state.composition.distance).toBeCloseTo(Number(gap), 8)
  })

  it('updates a keyed target during drag and restores the sampled pose on cancel or reload', () => {
    const scene = chain(), saved = JSON.stringify(scene)
    const projected = solve(scene, 140, 80, 250)
    expect(projected.local.target).toEqual({ x: 250, y: 80 })
    expect(projected.status).toBe('extended')
    const flip = makePivotCommand(scene, 'arm', { kind: 'flip' })
    const alternate = flip.execute(scene)
    for (const source of [scene, alternate, flip.undo(alternate), parseSceneJson(saved, true)]) {
      const state = solve(source, 140, 80)
      expect(state.status).toBe('reached')
      expect(state.local.distance).toBeLessThan(1e-9)
    }
    expect(JSON.stringify(scene)).toBe(saved)
  })

  it('projects through the final evaluated parent, including reflection, animated pivot and unequal scale', () => {
    const scene = chain(), group = newGroupLayer()
    group.transform = { ...group.transform, x: 20, y: 30, anchorX: 7, anchorY: 0, rotationDeg: 90, scaleX: -2, scaleY: 0.5 }
    const grouped = { ...scene, layers: [...scene.layers.map(l => ({ ...l, parentId: group.id })), group] }
    const frame = evaluateSceneFrame(grouped, 0, { baseOverrides: new Map([
      ['layers.goal.transform.x', 250], [`layers.${group.id}.transform.anchorX`, 10],
    ]) })
    const state = frame.ikDiagnostics.get('arm')!
    if (state.status === 'inactive') throw Error(state.reason)
    expect(state.status).toBe('extended')
    expect(state.local.distance).toBeCloseTo(40)
    expect(state.composition.distance).toBeCloseTo(80)
    expect(state.composition.tip.x).toBeCloseTo(30)
    expect(state.composition.tip.y).toBeCloseTo(-370)
  })

  it('reports invalid and collapsed chains, and folds equal segments at the root', () => {
    const scene = chain()
    const invalid = { ...scene, layers: scene.layers.filter(l => l.id !== 'goal') }
    expect(evaluateSceneFrame(invalid, 0).ikDiagnostics.get('arm')).toMatchObject({ status: 'inactive', reason: 'invalid-binding' })
    const collapsed = evaluateSceneFrame(scene, 0, { baseOverrides: new Map([['layers.forearm.transform.scaleX', 0]]) })
    expect(collapsed.ikDiagnostics.get('arm')).toMatchObject({ status: 'inactive', reason: 'zero-length' })
    expect(collapsed.overrides.get('layers.forearm.transform.rotationDeg')).toBe(0)
    const equal = { ...scene, layers: scene.layers.map(l => l.twoBoneIK2d ?
      { ...l, twoBoneIK2d: { ...l.twoBoneIK2d, tip: { x: 120, y: 0 } } } : l) }
    expect(solve(equal, 0).local.distance).toBeLessThan(1e-9)
    const group = newGroupLayer()
    group.transform.scaleY = 0
    const grouped = { ...scene, layers: [group, ...scene.layers.map(l => ({ ...l, parentId: group.id }))] }
    expect(evaluateSceneFrame(grouped, 0).ikDiagnostics.get('arm')).toMatchObject({ status: 'inactive', reason: 'singular-parent' })
  })

  it('reports each chain once when two independent arms share a target', () => {
    const scene = chain(), [upper, lower] = scene.layers
    const shared = { ...scene, layers: [...scene.layers,
      { ...upper, id: 'arm2', twoBoneIK2d: { ...upper.twoBoneIK2d!, lowerId: 'forearm2' } },
      { ...lower, id: 'forearm2', pivotLink2d: { ...lower.pivotLink2d!, driverId: 'arm2' } },
    ] }
    const frame = evaluateSceneFrame(shared, 0).ikDiagnostics
    expect(selectedIKDiagnostics(frame, new Set(['goal', 'arm2'])).map(d => d.upperId).sort()).toEqual(['arm', 'arm2'])
    expect(selectedIKDiagnostics(frame, new Set(['forearm'])).map(d => d.upperId)).toEqual(['arm'])
  })
})

describe('IK local joint limits', () => {
  const bounds = (minDeg: number, maxDeg: number, lockedDeg?: number) => ({ enabled: true, minDeg, maxDeg, lockedDeg })
  const edit = (scene: ChronoScene, joint: 'shoulder' | 'elbow', limit?: ReturnType<typeof bounds>) =>
    makePivotCommand(scene, 'arm', { kind: 'setJointLimit', joint, limit })

  it('finds the report optimum on the elbow boundary, preserving source, Undo and portable reload', () => {
    const original = chain()
    const shoulder = edit(original, 'shoulder', bounds(0, 90)).execute(original)
    const command = edit(shoulder, 'elbow', bounds(0, 60)), both = command.execute(shoulder)
    for (const scene of [both, parseSceneJson(JSON.stringify(both), true), command.execute(command.undo(both))]) {
      const result = solve(scene, 140, 80)
      expect(result).toMatchObject({ status: 'limited', elbowBound: 'max', alternateBend: true })
      expect(result.angles.shoulder).toBeCloseTo(4.459885, 5)
      expect(result.angles.elbow).toBe(60)
      expect(result.local.tip.x).toBeCloseTo(158.439506, 5)
      expect(result.local.tip.y).toBeCloseTo(90.536860, 5)
      expect(result.local.distance).toBeCloseTo(21.237721, 5)
    }
    const projected = { ...both, layers: both.layers.map(l => l.id === 'goal'
      ? { ...l, transform: { ...l.transform, x: 140, y: 80 } } : l) }
    const player = new ChronoPlayer(new RuntimeSceneCompiler().compile(projected))
    expect(player.tick(0).overrides).toEqual(evaluateSceneFrame(projected, 0).overrides)
    expect(solve(command.undo(both), 140, 80).status).toBe('reached')
    expect(solve(original, 140, 80).alternateBend).toBe(false)
    const off = edit(both, 'elbow', { ...bounds(0, 60), enabled: false }).execute(both)
    expect(solve(off, 140, 80).local).toEqual(solve(shoulder, 140, 80).local)
    expect(edit(both, 'elbow').execute(both).layers).toEqual(shoulder.layers)
    expect(() => edit(both, 'elbow', bounds(70, 10))).toThrow(/ordered/)
    expect(() => edit(both, 'elbow', bounds(0, 10, 11))).toThrow(/lock/)
  })

  it('uses geometric directions relative to a rotated driver and retains artwork rotation offsets', () => {
    const source = chain()
    const driver = newRectLayer()
    const scene = { ...source, layers: [...source.layers, { ...driver, id: 'driver',
      transform: { ...driver.transform, x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 90 } }] }
    const linked = makePivotCommand(scene, 'arm', { kind: 'link', driverId: 'driver' }).execute(scene)
    const shoulder = edit(linked, 'shoulder', bounds(-90, 90, 0)).execute(linked)
    const both = edit(shoulder, 'elbow', bounds(-90, 90, -90)).execute(shoulder)
    const result = solve(both, 90, 120)
    expect(result).toMatchObject({ status: 'reached', referenceDeg: 90, angles: { shoulder: 0, elbow: -90 },
      shoulderBound: 'locked', elbowBound: 'locked' })
    expect(result.local.elbow.y).toBeCloseTo(120)
    const transformed = { ...both, layers: both.layers.map(l => l.id === 'forearm' ?
      { ...l, transform: { ...l.transform, rotationDeg: 30 } } : l.id === 'arm' ?
      { ...l, twoBoneIK2d: { ...l.twoBoneIK2d!, tip: { x: 0, y: 90 } } } : l) }
    const frame = evaluateSceneFrame(transformed, 0)
    expect(frame.overrides.get('layers.forearm.transform.rotationDeg')).toBe(-90)
  })

  it('keeps seam-crossing and authored turns, handles singular interior optima and opposite branches', () => {
    const source = chain()
    const crossed = edit(source, 'shoulder', bounds(170, 190)).execute(source)
    const straight = solve(crossed, -300)
    expect(straight.angles.shoulder).toBe(180)
    expect(straight.status).toBe('extended')
    const turns = edit(source, 'shoulder', bounds(710, 730)).execute(source)
    expect(solve(turns, 300).angles.shoulder).toBe(720)
    const elbow = edit(source, 'elbow', bounds(20, 100)).execute(source)
    expect(solve(elbow, 140, 80)).toMatchObject({ status: 'reached', alternateBend: true })
    const equal = { ...source, layers: source.layers.map(l => l.twoBoneIK2d ? { ...l, twoBoneIK2d:
      { ...l.twoBoneIK2d, preferredShoulderOffsetDeg: 45, tip: { x: 120, y: 0 } } } : l) }
    const folded = solve(edit(equal, 'shoulder', bounds(20, 70)).execute(equal), 0)
    expect(folded.angles.shoulder).toBeCloseTo(45)
    expect(folded.local.distance).toBeLessThan(1e-8)
    expect(solve(edit(equal, 'shoulder', bounds(740, 790)).execute(equal), 0).angles.shoulder).toBeCloseTo(765)
  })

  it('matches or improves every sampled legal pose for asymmetric ranges and unreachable targets', () => {
    for (const [sMin, sMax, eMin, eMax] of [[15, 80, -150, 5], [110, 260, 20, 200], [-760, -250, 360, 690]]) {
      const source = chain(), shoulder = edit(source, 'shoulder', bounds(sMin, sMax)).execute(source)
      const both = edit(shoulder, 'elbow', bounds(eMin, eMax)).execute(shoulder)
      for (const [x, y] of [[0, 0], [80, 30], [-180, 70], [20, -310], [-10, -1]]) {
        const solved = solve(both, x, y)
        let best = Infinity
        for (let i = 0; i <= 32; i++) for (let j = 0; j <= 32; j++) {
          const s = (sMin + (sMax - sMin)*i/32) * Math.PI/180
          const e = (eMin + (eMax - eMin)*j/32) * Math.PI/180
          best = Math.min(best, Math.hypot(x - 120*Math.cos(s) - 90*Math.cos(s+e), y - 120*Math.sin(s) - 90*Math.sin(s+e)))
        }
        expect(solved.local.distance).toBeLessThan(best + 1e-8)
      }
    }
  })
})

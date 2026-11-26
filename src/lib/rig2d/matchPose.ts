import type { ChronoScene, Layer } from '../types'
import { distance, wrapAngle180 } from '../geometry/CoordinateSystem'
import { getLayerValue, type ExternalTimelineTime } from '../evaluator'
import { updateLayerProperty } from '../editor/autoKeyframe'
import { buildScalarKeyframeCommands, type ScalarKeyEdit } from '../editor/viewportKeyframes'
import { makeBatchCmd } from '../editor/commands-batch'
import { makeUpdateLayerCmd } from '../editor/commands-layer'
import { LayerIndex } from '../scene/LayerIndex'
import { drivenChannelReason } from '../timeline/authoring/keyableChannels'
import type { SceneFrameResult } from '../runtime/evaluateSceneFrame'
import { evaluateRigFrame } from './evaluateRigFrame'
import { readJoint, rotate, subtract, type JointPose } from './pose'
import type { PivotLink2D } from './types'

type RigFrame = Pick<SceneFrameResult, 'overrides' | 'rigSourceOverrides' | 'ikDiagnostics'>
export type RigWeightAction = { kind: 'setWeight'; weight: number } | { kind: 'matchFK' } | { kind: 'matchIK' }

/** Undo the driver's rigid motion since binding, returning source parent-local
 * pixels and artwork degrees. This inverse also handles pivots outside artwork. */
function beforeLink(pose: JointPose, driver: JointPose, link: PivotLink2D): JointPose {
  const delta = link.bindRotationDeg - driver.angle
  const v = rotate(subtract(pose.pivot, driver.pivot), delta)
  return { ...pose, pivot: { x: link.bindPivot.x + v.x, y: link.bindPivot.y + v.y }, angle: pose.angle + delta }
}

/** Prepare a single Undo from the displayed pose and its pre-rig inputs.
 * FK match writes the two joints in their respective bind spaces. IK match
 * places the target pivot at the displayed wrist and selects its elbow side.
 * Re-solve with frozen live inputs before committing: an incompatible limit
 * or a driven target must never produce a partial or visibly jumping switch.
 * Auto Key and existing channels use the active timeline's local clock. */
export function makeRigWeightCommand(scene: ChronoScene, upper: Layer, action: RigWeightAction,
  frame: RigFrame, clock: ExternalTimelineTime | null, timeMs: number, autoKey: boolean) {
  const chain = frame.ikDiagnostics.get(upper.id), ik = upper.twoBoneIK2d
  if (!ik || !chain || chain.status === 'inactive') throw new Error('Select an active two-bone IK chain.')
  const weight = action.kind === 'setWeight' ? action.weight : Number(action.kind === 'matchIK')
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error('IK weight must be between 0 and 1.')
  const index = new LayerIndex(scene.layers)
  const lower = index.get(ik.lowerId)!, target = index.get(ik.targetId)!
  const timeline = scene.timelines.find(t => t.id === clock?.timelineId)
  const edits: ScalarKeyEdit[] = []
  const simulatedInputs = new Map(frame.rigSourceOverrides)
  let staged = scene
  const assertUnlocked = (id: string) => {
    if (Array.from(index.ancestorIds([id])).some(key => index.get(key)?.locked || index.get(key)?.frozen))
      throw new Error('Unlock the affected layer and its group first.')
  }
  assertUnlocked(upper.id)
  const write = (layer: Layer, path: string, value: number, previous: number) => {
    if (Math.abs(value - previous) < 1e-9) return
    const address = 'layers.' + layer.id + '.' + path
    const track = timeline?.tracks.find(t => t.target === address)
    assertUnlocked(layer.id)
    const issue = drivenChannelReason(scene, layer, path, track)
    if (issue) throw new Error(issue)
    const keyed = autoKey || !!track?.keyframes.length
    if (keyed && scene.stateMachines?.some(sm => sm.states.some(state => state.timelineId === timeline?.id)))
      throw new Error('Bake the state-machine pose before keying this switch.')
    if (keyed && !timeline && scene.timelines.length) throw new Error('Select the timeline to key this switch.')
    if (!keyed) staged = updateLayerProperty(staged, layer.id, path, value)
    edits.push({ layerId: layer.id, target: address, value, initialValue: previous })
    simulatedInputs.set(address, value)
  }
  const displayed = (layer: Layer) => readJoint(layer, frame.overrides)
  const writePose = (layer: Layer, desired: JointPose, writeAngle: boolean) => {
    const link = layer.pivotLink2d
    const pose = link ? beforeLink(desired, displayed(index.get(link.driverId)!), link) : desired
    const source = readJoint(layer, frame.rigSourceOverrides)
    for (const axis of ['x', 'y'] as const) {
      const path = 'transform.' + axis
      const previous = getLayerValue(frame.rigSourceOverrides, layer.id, path, layer.transform[axis])
      write(layer, path, previous + (pose.pivot[axis] - source.pivot[axis]), previous)
    }
    if (writeAngle) write(layer, 'transform.rotationDeg', pose.angle, source.angle)
  }
  if (action.kind === 'matchFK') {
    writePose(upper, displayed(upper), true)
    writePose(lower, displayed(lower), true)
  }
  if (action.kind === 'matchIK') {
    const { shoulder, elbow, tip } = chain.local
    writePose(target, { ...displayed(target), pivot: tip }, false)
    const arm = subtract(elbow, shoulder), reach = subtract(tip, shoulder)
    const cross = reach.x * arm.y - reach.y * arm.x
    const bend = Math.abs(cross) > 1e-10 * Math.hypot(arm.x, arm.y) * Math.hypot(reach.x, reach.y)
      ? (cross > 0 ? 1 : -1) : ik.bend
    const folded = Math.hypot(reach.x, reach.y) < 1e-8
    if (bend !== ik.bend || folded) {
      const patch = { ...ik, bend, ...(folded && { preferredShoulderOffsetDeg: chain.shoulderOffsetDeg }) }
      staged = makeUpdateLayerCmd(upper.id, { twoBoneIK2d: patch }, upper).execute(staged)
    }
  }
  write(upper, 'twoBoneIK2d.weight', weight, chain.weight)
  const keys = buildScalarKeyframeCommands(scene, edits, {
    timelineId: clock?.timelineId ?? '', timeMs: clock?.localTimeMs ?? timeMs, timeBasis: 'local', autoKeyframe: autoKey,
  })
  if (action.kind !== 'setWeight') {
    const result = evaluateRigFrame(staged, timeMs, simulatedInputs)
    const matched = result.ikDiagnostics.get(upper.id)
    const error = matched && matched.status !== 'inactive' ? distance(matched.local.tip, chain.local.tip) : Infinity
    if (error > 1e-5 || [upper, lower].some(layer => {
      const original = displayed(layer), actual = readJoint(layer, result.overrides)
      return distance(original.pivot, actual.pivot) > 1e-5 || Math.abs(wrapAngle180(original.angle - actual.angle)) > 1e-5
    })) throw new Error('The current limits or driven joints cannot reproduce this pose. Adjust them before switching.')
  }
  const patches = staged.layers.flatMap((layer, i) => layer === scene.layers[i] ? [] : [makeUpdateLayerCmd(layer.id, layer, scene.layers[i])])
  return makeBatchCmd(action.kind === 'setWeight' ? 'Set IK weight' : action.kind === 'matchFK' ? 'Match to FK' : 'Match to IK', [...patches, ...keys])
}

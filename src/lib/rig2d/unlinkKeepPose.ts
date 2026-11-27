import type { ChronoScene, Layer } from '../types'
import { getLayerValue, type ExternalTimelineTime } from '../evaluator'
import type { SceneFrameResult } from '../runtime/evaluateSceneFrame'
import { hasTransformDriver } from '../scene/properties/hasTransformDriver'
import { makeBatchCmd } from '../editor/commands-batch'
import { makeUpdateLayerCmd } from '../editor/commands-layer'
import { buildViewportKeyframeCommands } from '../editor/viewportKeyframes'
import { makePivotCommand } from './commands'
import { hasInvalidPivotLink } from './frame'
import { rebaseShoulderLimit } from './jointLimits'
import { followPivot, readJoint } from './pose'

type PoseFrame = Pick<SceneFrameResult, 'overrides' | 'rigSourceOverrides'>
const channels = ['x', 'y', 'rotationDeg'] as const

/** Measure which parent-local pixels/degrees must become source values or keys at
 * the displayed frame. The shared parent, animated anchors and both scale axes stay
 * in place. A surviving IK chain needs its incoming FK pose in the new reference
 * axes so its solver can produce the same final rotation. Safe to call for a preview. */
export function measureUnlinkPose(scene: ChronoScene, layer: Layer, frame: PoseFrame, timelineId?: string) {
  const source = frame.rigSourceOverrides
  let pose = readJoint(layer, frame.overrides)
  let ik = layer.twoBoneIK2d
  const link = layer.pivotLink2d
  if (ik && link && !hasInvalidPivotLink(scene.layers, layer.id)) {
    const driver = scene.layers.find(item => item.id === link.driverId)
    if (driver) {
      const driverPose = readJoint(driver, frame.overrides)
      pose = followPivot(readJoint(layer, source), driverPose, link)
      ik = rebaseShoulderLimit(ik, driverPose.angle)
    }
  }
  const value = (key: keyof Layer['transform']) => getLayerValue(source, layer.id, 'transform.' + key, layer.transform[key])
  const next = { x: pose.pivot.x - value('anchorX'), y: pose.pivot.y - value('anchorY'), rotationDeg: pose.angle }
  const timeline = scene.timelines.find(item => item.id === timelineId)
  const edits = channels.filter(key => Math.abs(next[key] - value(key)) > 1e-9).map(key => {
    const property = 'transform.' + key
    const keyed = !!timeline?.tracks.some(track => track.target === `layers.${layer.id}.${property}` && track.keyframes.length > 0)
    return { key, property, value: next[key], keyed }
  })
  return { edits, ik }
}

/** Capture this displayed frame once and prepare one history entry. Existing
 * animation is keyed on its authoring clock; unkeyed channels become static
 * values. Reject conflicting writers before dispatch. The ordinary unlink owns
 * relationship cleanup, including removal/restoration of a dependent IK chain. */
export function makeUnlinkKeepPoseCommand(scene: ChronoScene, layer: Layer, frame: PoseFrame,
  clock: ExternalTimelineTime | null) {
  const unlink = makePivotCommand(scene, layer.id, { kind: 'unlink' })
  const detached = unlink.execute(scene).layers.find(item => item.id === layer.id)!
  const { edits, ik } = measureUnlinkPose(scene, layer, frame, clock?.timelineId)
  const properties = edits.map(edit => edit.property)
  if (edits.length && hasTransformDriver(scene, layer, properties))
    throw new Error('Bake the driven position or rotation channels before detaching at this pose.')
  if (edits.some(edit => edit.keyed) && scene.stateMachines?.some(sm => sm.states.some(state => state.timelineId === clock?.timelineId)))
    throw new Error('Bake the state-machine animation before detaching at this pose.')
  const transform = { ...layer.transform }, keyValues = { ...layer.transform }
  for (const edit of edits) {
    keyValues[edit.key] = edit.value
    if (!edit.keyed) transform[edit.key] = edit.value
  }
  const keys = buildViewportKeyframeCommands(scene, [{ prev: layer, next: { ...layer, transform: keyValues }, changedProperties: properties }],
    { timelineId: clock?.timelineId ?? '', timeMs: clock?.localTimeMs ?? 0, timeBasis: 'local', autoKeyframe: false })
  const commands = [unlink]
  if (edits.some(edit => !edit.keyed) || ik !== layer.twoBoneIK2d)
    commands.push(makeUpdateLayerCmd(layer.id, { transform, ...(ik && { twoBoneIK2d: ik }) }, detached))
  return makeBatchCmd('Pozu koruyarak ayır', [...commands, ...keys])
}

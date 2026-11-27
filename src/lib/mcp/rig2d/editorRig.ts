import { authoringTime } from '../../timeline/authoring/timelineNavigation'
import type { ChronoScene } from '../../types'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { prepareRigEdit, type RigEdit, type RigSample } from '../../rig2d/authoring'
import type { JsonObject } from '../protocol'

export interface DisplayedRig extends RigSample {
  editingBlocked: boolean
}

/** Resolve a schema-validated tool against a single displayed editor frame.
 * Native commands own validation, FK/IK sampling, timeline writes and Undo. */
export function buildRigCommand(name: string, args: JsonObject, scene: ChronoScene, timeMs: number, live: DisplayedRig) {
  if (live.editingBlocked) throw new Error('Pause playback and finish preview before editing Link & IK.')
  const id = args.layerId ?? args.upperLayerId
  let action: RigEdit
  switch (name) {
    case 'link_layer_pivots_2d': action = { kind: 'link', driverId: args.driverLayerId }; break
    case 'unlink_layer_pivots_2d':
      action = { kind: args.mode === 'keepPose' ? 'unlinkKeepPose' : 'unlink' }; break
    case 'set_ik2d_weight': action = { kind: 'setWeight', weight: args.weight }; break
    case 'match_ik2d_pose': action = { kind: args.to === 'fk' ? 'matchFK' : 'matchIK' }; break
    case 'bind_two_bone_ik_2d': action = { kind: 'ik', lowerId: args.lowerLayerId, targetId: args.targetLayerId }; break
    case 'remove_two_bone_ik_2d': action = { kind: 'clearIK' }; break
    case 'set_ik2d_joint_limits': action = { kind: 'setJointLimit', joint: args.joint, limit: args.limit ?? undefined }; break
    case 'set_ik2d_bend': action = { kind: args.action }; break
    default: throw new Error('Unknown Link & IK command: ' + name)
  }
  return prepareRigEdit(scene, id, action, timeMs, { ...live, autoKey: args.autoKey ?? live.autoKey })
}

/** Report one or all chains from the live solver, or sample authored inputs at
 * composition time. An isolated timeline can be sampled at its exact local end.
 * Inactive chains retain their solver reason; no constraints means an empty list. */
export function readRigDiagnostics(scene: ChronoScene, args: JsonObject, playheadMs: number, live: DisplayedRig) {
  const timeMs = args.timeMs ?? playheadMs
  const timeline = args.timelineId && scene.timelines.find(item => item.id === args.timelineId)
  if (args.timelineId && !timeline) throw new Error('Timeline not found: ' + args.timelineId)
  const explicit = args.timeMs !== undefined || !!timeline
  if (explicit && scene.stateMachines?.length && !timeline) throw new Error('Specify timelineId to sample a state-machine scene, or omit timeMs for the live frame.')
  const sampled = timeline ? { ...scene, timelines: [timeline], stateMachines: [] } : scene
  const frame = explicit ? evaluateSceneFrame(sampled, timeMs, {
    ...(timeline && { externalTime: { timelineId: timeline.id, localTimeMs: authoringTime(timeline, timeMs) } }),
  }) : live.frame
  const chain = args.upperLayerId && frame.ikDiagnostics.get(args.upperLayerId)
  if (args.upperLayerId && !chain) throw new Error('No IK chain on upper layer: ' + args.upperLayerId)
  return { timeMs, units: { local: 'parent-local px', composition: 'composition px', angles: 'degrees clockwise' },
    chains: chain ? [chain] : Array.from(frame.ikDiagnostics.values()) }
}

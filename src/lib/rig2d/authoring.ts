import type { ChronoScene } from '../types'
import type { ExternalTimelineTime } from '../evaluator'
import type { SceneFrameResult } from '../runtime/evaluateSceneFrame'
import { makePivotCommand, type LinkAction } from './commands'
import { makeRigWeightCommand, type RigWeightAction } from './matchPose'
import { makeUnlinkKeepPoseCommand } from './unlinkKeepPose'

export type RigEdit = LinkAction | RigWeightAction | { kind: 'unlinkKeepPose' }
export interface RigSample {
  frame: Pick<SceneFrameResult, 'overrides' | 'rigSourceOverrides' | 'ikDiagnostics'>
  clock: ExternalTimelineTime | null
  autoKey?: boolean
}

/** Prepare a native Undo command from one consistent displayed or authored frame.
 * timeMs is composition time, while key writes use the supplied timeline clock.
 * Validate the discriminants at runtime because script callers supply JSON. */
export function prepareRigEdit(scene: ChronoScene, id: string, action: RigEdit, timeMs: number, sample: RigSample) {
  const layer = scene.layers.find(item => item.id === id)
  if (!layer) throw new Error('Layer not found: ' + id)
  const { frame, clock } = sample
  switch (action.kind) {
    case 'unlinkKeepPose': return makeUnlinkKeepPoseCommand(scene, layer, frame, clock)
    case 'setWeight': case 'matchIK': case 'matchFK':
      return makeRigWeightCommand(scene, layer, action, frame, clock, timeMs, sample.autoKey ?? false)
    case 'setJointLimit':
      if (!['elbow', 'shoulder'].includes(action.joint)) throw new Error('Choose shoulder or elbow.')
      break
    case 'ik': case 'link': case 'unlink': case 'clearIK': case 'flip': case 'preferPose': case 'clearPreference': break
    default: throw new Error('Unknown 2D rig edit.')
  }
  return makePivotCommand(scene, id, action, timeMs, frame.overrides, frame.ikDiagnostics)
}

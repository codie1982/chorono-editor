import { authoringTime } from '../../timeline/authoring/timelineNavigation'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { prepareRigEdit, type RigEdit } from '../../rig2d/authoring'
import type { ApiContext } from './LayerHandle'
import { assertSafeScriptData, copyScriptData } from './scriptData'

export interface ScriptRigOptions { timeMs?: number; timelineId?: string; autoKey?: boolean }
export type ScriptRigAction = RigEdit | { kind: 'diagnostics' }

const rigFields: Record<ScriptRigAction['kind'], readonly string[]> = {
  link: ['driverId'], ik: ['lowerId', 'targetId'], setWeight: ['weight'], setJointLimit: ['joint', 'limit'],
  unlink: [], unlinkKeepPose: [], matchFK: [], matchIK: [], clearIK: [], flip: [], preferPose: [], clearPreference: [], diagnostics: [],
}
export const rigScriptKinds = Object.keys(rigFields)

/** Sample the current private draft, including earlier writes in the same script.
 * A timeline samples local milliseconds (default zero, clamped at its end).
 * Use the script's active timeline by default. With no timeline, sample base
 * composition time. Diagnostics return detached solver values for this upper
 * layer. Writes join the caller's script Undo; export no UI or playback state. */
export function scriptRig2D(ctx: ApiContext, layerId: string, action: ScriptRigAction, options: ScriptRigOptions = {}) {
  if (!action || typeof action !== 'object' || !options || typeof options !== 'object' || Array.isArray(options))
    throw new Error('Supply a rig action and optional sampling settings.')
  assertSafeScriptData(action)
  assertSafeScriptData(options)
  if (!Object.hasOwn(rigFields, action.kind) || Object.keys(action).some(key => key !== 'kind' && !rigFields[action.kind].includes(key))
    || Object.keys(options).some(key => !['timeMs', 'timelineId', 'autoKey'].includes(key))) throw new Error('Unknown 2D rig action or option.')
  const { timeMs = 0, autoKey = false, timelineId = ctx.resolveTimelineId() } = options
  if (!Number.isFinite(timeMs) || timeMs < 0 || typeof autoKey !== 'boolean' || timelineId !== undefined && typeof timelineId !== 'string')
    throw new Error('Use nonnegative milliseconds, a timeline ID and a boolean autoKey flag.')
  const scene = ctx.host.getScene()
  const timeline = scene.timelines.find(item => item.id === timelineId)
  if (timelineId !== undefined && !timeline) throw new Error('Timeline not found: ' + timelineId)
  if (!timeline && autoKey) throw new Error('Choose a timeline before using Auto Key.')
  const clock = timeline ? { timelineId: timeline.id, localTimeMs: authoringTime(timeline, timeMs) } : null
  const sampled = timeline ? { ...scene, timelines: [timeline], stateMachines: [] } : scene
  const frame = evaluateSceneFrame(sampled, timeMs, clock ? { externalTime: clock } : {})
  if (action.kind === 'diagnostics') {
    const chain = frame.ikDiagnostics.get(layerId)
    if (!chain) throw new Error('No IK chain on upper layer: ' + layerId)
    return copyScriptData(chain)
  }
  ctx.host.applyCommand(prepareRigEdit(scene, layerId, action, timeMs, { frame, clock, autoKey }))
  return null
}

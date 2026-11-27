import type { ChronoScene, Layer } from '../types'
import type { IKDiagnostics } from './diagnostics'
import type { OverrideMap } from '../evaluator'
import type { EditorCommand } from '../editor/commands-keyframe'
import { LayerIndex } from '../scene/LayerIndex'
import { evaluateSceneFrame } from '../runtime/evaluateSceneFrame'
import { assertLinkPlan, supportsPivotLink } from './frame'
import { length, readJoint, rotate, subtract } from './pose'

import { validLimit } from './jointLimits'
import type { IKAngleLimit, IKJoint } from './types'

export type LinkAction =
  | { kind: 'link'; driverId: string }
  | { kind: 'ik'; lowerId: string; targetId: string }
  | { kind: 'setJointLimit'; joint: IKJoint; limit?: IKAngleLimit }
  | { kind: 'unlink' | 'flip' | 'clearIK' | 'preferPose' | 'clearPreference' }

const labels = { setJointLimit: 'Set IK joint limit', link: 'Link pivots', unlink: 'Unlink pivots', ik: 'Enable two-bone IK', flip: 'Flip IK bend', clearIK: 'Remove IK',
  preferPose: 'Prefer this IK pose', clearPreference: 'Clear preferred IK pose' }

/** Prepare one undoable source edit. Link/IK binding samples the current evaluated
 * frame exactly once, in parent-local pixels. A supplied live frame includes the
 * host's active timeline/parameters. Redo restores the original binding even if
 * playback has advanced. Capturing a live pose requires diagnostics from that same frame. Removing a constraint restores the underlying animation. */
export function makePivotCommand(scene: ChronoScene, id: string, action: LinkAction, timeMs = 0, frame?: OverrideMap, diagnostics?: IKDiagnostics): EditorCommand {
  const index = new LayerIndex(scene.layers)
  const layer = index.get(id)
  if (!layer) throw new Error('Select an existing layer.')
  const changes = new Map<string, Partial<Layer>>()
  const patch = (item: Layer, value: Partial<Layer>) => {
    if (Array.from(index.ancestorIds([item.id])).some(key => index.get(key)?.locked || index.get(key)?.frozen))
      throw new Error('Unlock and unfreeze the affected layers and their groups first.')
    changes.set(item.id, value)
  }
  const sibling = (key: string) => {
    const other = index.get(key)
    if (!other || other === layer || other.parentId !== layer.parentId || !supportsPivotLink(layer) || !supportsPivotLink(other))
      throw new Error('Select another eligible layer in the same group.')
    return other
  }
  if (action.kind === 'link') {
    if (layer.pivotLink2d) throw new Error('Unlink the existing driver first.')
    const driver = sibling(action.driverId)
    const pose = readJoint(driver, frame ?? evaluateSceneFrame(scene, timeMs).overrides)
    patch(layer, { pivotLink2d: { driverId: driver.id, bindPivot: pose.pivot, bindRotationDeg: pose.angle } })
  } else if (action.kind === 'ik') {
    const lower = sibling(action.lowerId), target = sibling(action.targetId)
    if (layer.twoBoneIK2d || target === lower || lower.pivotLink2d?.driverId !== id)
      throw new Error('Link the lower segment to the upper segment and choose a separate end target.')
    const values = frame ?? evaluateSceneFrame(scene, timeMs).overrides
    const root = readJoint(layer, values), elbow = readJoint(lower, values), end = readJoint(target, values)
    const first = subtract(elbow.pivot, root.pivot), last = subtract(end.pivot, elbow.pivot)
    if (Math.min(length(first), length(last), Math.abs(elbow.sx), Math.abs(elbow.sy)) < 1e-8)
      throw new Error('Place the pivots at distinct joints and the target at the tip. The lower segment needs nonzero scale.')
    if (Array.from(index.ancestorIds([lower.id])).some(key => index.get(key)?.locked || index.get(key)?.frozen))
      throw new Error('Unlock the lower segment before enabling IK.')
    const local = rotate(last, -elbow.angle)
    const reach = subtract(end.pivot, root.pivot)
    patch(layer, { twoBoneIK2d: { lowerId: lower.id, targetId: target.id, tip: { x: local.x / elbow.sx, y: local.y / elbow.sy },
      bend: reach.x * first.y - reach.y * first.x >= 0 ? 1 : -1 } })
  } else if (action.kind === 'unlink') {
    if (!layer.pivotLink2d) throw new Error('This layer has no pivot link.')
    patch(layer, { pivotLink2d: undefined })
    const driver = index.get(layer.pivotLink2d.driverId)
    if (driver?.twoBoneIK2d?.lowerId === layer.id) patch(driver, { twoBoneIK2d: undefined })
  } else {
    const ik = layer.twoBoneIK2d
    if (!ik) throw new Error('This layer has no IK constraint.')
    if (action.kind === 'setJointLimit') {
      if (!validLimit(action.limit)) throw new Error('Use finite ordered angle bounds and a lock within the range.')
      const key = action.joint === 'shoulder' ? 'shoulderLimit' : 'elbowLimit'
      const updated = { ...ik }
      if (action.limit) updated[key] = { ...action.limit }
      else delete updated[key]
      patch(layer, { twoBoneIK2d: updated })
    } else if (action.kind === 'preferPose') {
      const measured = diagnostics ?? (frame ? undefined : evaluateSceneFrame(scene, timeMs).ikDiagnostics)
      const chain = measured?.get(id)
      if (!chain || chain.status === 'inactive' || chain.lowerId !== ik.lowerId || chain.targetId !== ik.targetId)
        throw new Error('Select an active IK chain to capture its evaluated pose.')
      patch(layer, { twoBoneIK2d: { ...ik, preferredShoulderOffsetDeg: chain.shoulderOffsetDeg } })
    } else if (action.kind === 'clearPreference') {
      const { preferredShoulderOffsetDeg, ...rest } = ik
      patch(layer, { twoBoneIK2d: rest })
    } else {
      patch(layer, { twoBoneIK2d: action.kind === 'flip' ? { ...ik, bend: ik.bend === 1 ? -1 : 1 } : undefined })
    }
  }
  const layers = scene.layers.map(item => changes.has(item.id) ? { ...item, ...changes.get(item.id) } : item)
  if (action.kind === 'link' || action.kind === 'ik') assertLinkPlan(layers, scene.layers, new Set(changes.keys()))
  return { label: labels[action.kind],
    execute(current) {
      if (current.layers !== scene.layers && (current.layers.length !== scene.layers.length || !current.layers.every((item, i) => item === scene.layers[i])))
        throw new Error('Layers changed. Bind from the current frame again.')
      return { ...current, layers }
    },
    undo: current => ({ ...current, layers: scene.layers }),
  }
}

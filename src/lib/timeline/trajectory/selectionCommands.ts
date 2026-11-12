import type { ChronoScene } from '../../types'
import { applyCurveKeyframeChanges, curveChangesCollide, curveDragTimeLimits, type CurveKeyframeChange } from '../curveEditing'
import { editableTrajectory, trajectoryNodeRefs, trajectorySelectedIds } from './editHelpers'
import { trajectoryTrackCommand } from './trackEditCommand'
import type { TrajectoryCommandScope, TrajectoryEditResult, TrajectoryNodeRef } from './commandTypes'
import { guardedTrajectoryKeyIds } from './keyIds'

type SelectionOptions = TrajectoryCommandScope & { nodes: readonly TrajectoryNodeRef[] }

/** Remove only the explicitly selected x/y key IDs from one layer/timeline.
 * Track settings, other keys and membership survive, including empty tracks.
 * This is a source-key deletion: adjacent interpolation naturally changes. */
export function deleteTrajectoryNodes(scene: ChronoScene, options: SelectionOptions): TrajectoryEditResult {
  const context = editableTrajectory(scene, options), nodes = trajectoryNodeRefs(context, options.nodes)
  const ids = new Set(trajectorySelectedIds(nodes))
  const edits = [context.xTrack, context.yTrack].flatMap(before => {
    if (!before || !before.keyframes.some(key => ids.has(key.id))) return []
    return [{ before, after: { ...before, keyframes: before.keyframes.filter(key => !ids.has(key.id)) } }]
  })
  return trajectoryTrackCommand(scene, options, edits, [], 'Delete position keys')
}

/** Shift selected position-key times by a shared local-ms delta. Values, IDs,
 * easing/tangents and pair spacing remain unchanged. Animated parents may move
 * the resulting world pose at the new time; retiming does not reinterpret
 * source values as world coordinates. Bounds/collisions reject all-or-none. */
export function retimeTrajectoryNodes(scene: ChronoScene,
  options: SelectionOptions & { deltaTimeMs: number }): TrajectoryEditResult {
  return retime(scene, options, false)
}

/** Duplicate only selected x/y records with fresh IDs at a shared local-time
 * offset. Sparse nodes stay sparse. Original records remain untouched and the
 * fresh IDs are captured in the command for preview/redo. Collisions never
 * replace an unselected source key. */
export function duplicateTrajectoryNodes(scene: ChronoScene,
  options: SelectionOptions & { deltaTimeMs: number }): TrajectoryEditResult {
  return retime(scene, options, true)
}

/** Share time validation, key address resolution, sorting and collision policy
 * with the existing Curve Editor; only trajectory-owned tracks are patched. */
function retime(scene: ChronoScene, options: SelectionOptions & { deltaTimeMs: number }, duplicate: boolean): TrajectoryEditResult {
  const context = editableTrajectory(scene, options), nodes = trajectoryNodeRefs(context, options.nodes)
  const selectedIds = trajectorySelectedIds(nodes), selected = new Set(selectedIds)
  const originals = [context.xTrack, context.yTrack].flatMap(track => track
    ? track.keyframes.filter(key => selected.has(key.id)).map(key => ({ target: track.target, key })) : [])
  const limits = curveDragTimeLimits(originals.map(value => value.key.timeMs), context.timeline.durationMs)
  if (!limits || !Number.isFinite(options.deltaTimeMs) || options.deltaTimeMs < limits.min || options.deltaTimeMs > limits.max) {
    throw new Error('All selected position keys must remain inside the timeline duration after retiming.')
  }
  if (!duplicate && options.deltaTimeMs === 0) return { command: null, selectedIds, diagnostics: [] }
  const keyId = guardedTrajectoryKeyIds(scene)
  const changes: CurveKeyframeChange[] = originals.map(({ target, key }) => ({ target,
    keyframe: { ...key, ...(duplicate ? { id: keyId({ target, timeMs: key.timeMs + options.deltaTimeMs, role: 'node' }) } : {}),
      timeMs: key.timeMs + options.deltaTimeMs }, duplicate }))
  if (curveChangesCollide(scene, context.timeline.id, changes)) throw new Error('Retiming would collide with another position key within 1 ms; no keys were changed.')
  const timeline = applyCurveKeyframeChanges(scene, context.timeline.id, changes).timelines.find(value => value.id === context.timeline.id)!
  const targets = new Set(changes.map(change => change.target))
  const edits = timeline.tracks.filter(track => targets.has(track.target)).map(after => ({
    before: context.timeline.tracks.find(track => track.target === after.target), after,
  }))
  return trajectoryTrackCommand(scene, options, edits, changes.map(change => change.keyframe.id),
    duplicate ? 'Duplicate position keys' : 'Retime position keys')
}

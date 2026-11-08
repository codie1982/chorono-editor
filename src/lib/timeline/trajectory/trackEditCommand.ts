import type { ChronoScene, Track } from '../../types'
import { ensureLayerInTimeline } from '../keyframeOps'
import type { TrajectoryCommandScope, TrajectoryEditResult } from './commandTypes'
import { trajectorySourceGuard } from './sourceGuard'

export interface TrajectoryTrackEdit { before?: Track; after: Track }

/** Prepare a reversible patch of only affected position-key arrays and explicit
 * timeline membership. Other track settings, scene layers, assets and timelines
 * stay owned by their existing modules. New tracks are removed on undo; an
 * existing empty track retains its settings. Generated key IDs are captured.
 * Execute refuses stale affected arrays instead of overwriting intervening edits. */
export function trajectoryTrackCommand(base: ChronoScene, scope: TrajectoryCommandScope,
  edits: readonly TrajectoryTrackEdit[], selectedIds: string[], label: string,
  diagnostics: string[] = [], supportIds: string[] = []): TrajectoryEditResult {
  const changed = edits.filter(edit => edit.before?.keyframes !== edit.after.keyframes)
  if (!changed.length) return { command: null, selectedIds, diagnostics, supportIds }
  const timeline = base.timelines.find(value => value.id === scope.timelineId)!
  const addsMembership = Array.isArray(timeline.layerIds) && !timeline.layerIds.includes(scope.layerId)
  const targets = new Set(changed.map(edit => edit.after.target))
  const assertSource = trajectorySourceGuard(base, scope)
  const patch = (scene: ChronoScene, undo: boolean): ChronoScene => {
    if (!undo) assertSource(scene)
    const current = scene.timelines.find(value => value.id === scope.timelineId)
    if (!current) throw new Error('The trajectory timeline no longer exists.')
    if (!undo) for (const edit of changed) {
      const track = current.tracks.find(value => value.target === edit.after.target)
      if (edit.before ? track?.keyframes !== edit.before.keyframes : !!track) {
        throw new Error('Position keys changed after this edit was prepared. Read the current trajectory and retry.')
      }
    }
    const tracks = current.tracks.flatMap(track => {
      if (!targets.has(track.target)) return [track]
      const edit = changed.find(value => value.after.target === track.target)!
      if (undo && !edit.before) return []
      return [{ ...track, keyframes: (undo ? edit.before! : edit.after).keyframes }]
    })
    if (!undo) for (const edit of changed) if (!edit.before) tracks.push(edit.after)
    let next = { ...scene, timelines: scene.timelines.map(value => value.id !== scope.timelineId ? value : {
      ...value, tracks, ...(undo && addsMembership && value.layerIds
        ? { layerIds: value.layerIds.filter(id => id !== scope.layerId) } : {}),
    }) }
    if (!undo && changed.some(edit => edit.after.keyframes.length)) next = ensureLayerInTimeline(next, scope.timelineId, scope.layerId)
    return next
  }
  return { command: { label, execute: scene => patch(scene, false), undo: scene => patch(scene, true) },
    selectedIds, diagnostics, supportIds }
}

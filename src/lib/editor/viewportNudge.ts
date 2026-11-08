import type { ChronoScene } from '../types'
import type { OverrideMap } from '../evaluator'
import { prepareTransformTargets, translateTransformTargets } from '../canvas/math/preparedTransforms'
import { sourceTransformChange } from '../canvas/math/sourceTransformChange'
import { makeUpdateLayerCmd } from './commands-layer'
import { makeBatchCmd } from './commands-batch'
import { buildViewportKeyframeCommands, type ViewportKeyframeOptions } from './viewportKeyframes'
import type { EditorCommand } from './commands-keyframe'

/** The same immutable displayed frame and key policy used by pointer edits.
 * Override maps are borrowed from this exact scene/time and are never retained
 * in serialized source; omitted maps evaluate ordinary timelines. */
export interface ViewportNudgeOptions extends ViewportKeyframeOptions {
  overrides?: OverrideMap
}

/** Prepare one keyboard movement of selected independent roots in composition
 * pixels. Selected descendants inherit their ancestor's movement exactly once;
 * different parent axes are converted through the shared inverse-parent math.
 * Only intended channels become source patches, so unrelated evaluated scale,
 * rotation and position outputs do not overwrite authored fallback values.
 *
 * Returns null for an empty selection or displayed no-op. Invalid/non-finite
 * time/delta, locked/frozen/singular/driver targets and key conflicts throw
 * before a command is returned; scene/history remain untouched. Source and
 * intended keys are one batch, with stable key IDs/metadata and exact undo.
 * Playback/drag/modal eligibility belongs to the UI adapter. No snapping or
 * canvas-bound clamping is applied to a deliberate numeric keyboard step.
 */
export function buildViewportNudgeCommand(
  scene: ChronoScene, ids: ReadonlySet<string> | readonly string[], deltaWorld: { x: number; y: number },
  options: ViewportNudgeOptions,
): EditorCommand | null {
  if (![deltaWorld.x, deltaWorld.y].every(Number.isFinite)) throw new RangeError('Keyboard movement must be finite.')
  const selected = new Set(ids)
  if (!selected.size || (deltaWorld.x === 0 && deltaWorld.y === 0)) return null
  const prepared = prepareTransformTargets(scene, selected, options.timeMs, options.overrides)
  if (!prepared.ok) throw new Error(prepared.reason)
  const translated = translateTransformTargets(prepared.targets, deltaWorld)
  if (!translated.ok) throw new Error(translated.reason)
  const targets = new Map(prepared.targets.map(target => [target.id, target]))
  const changes = translated.changes.flatMap(change => {
    const source = sourceTransformChange(targets.get(change.id)!, change.transform)
    return source ? [source] : []
  })
  if (!changes.length) return null
  const keys = buildViewportKeyframeCommands(scene, changes, options)
  return makeBatchCmd(`Move ${changes.length} Selected Layer${changes.length === 1 ? '' : 's'}`, [
    ...changes.map(change => makeUpdateLayerCmd(change.prev.id, change.next, change.prev)), ...keys,
  ])
}

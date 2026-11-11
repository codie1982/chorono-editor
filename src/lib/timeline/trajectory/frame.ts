import { evaluateSceneFrame } from '@/lib/runtime/evaluateSceneFrame'
import type { ChronoScene } from '@/lib/types'
import { type OverrideMap } from '@/lib/evaluator'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { resolveDisplayTransform } from '@/lib/render/resolveDisplayTransform'
import type { TrajectoryContext, TrajectoryPoint, TrajectorySample } from './types'

/** Evaluate exact LOCAL authoring time on one timeline, including its keyed end
 * even when playback loops/ping-pongs. The canonical evaluator's external time
 * override supplies that clock; every other timeline retains its ordinary clock
 * at representative global=local time. Sources and timing flags are unchanged.
 * Returns a new transient override map; throws for missing timeline/invalid time. */
export function evaluateTrajectoryFrame(scene: ChronoScene, timelineId: string, localTimeMs: number): OverrideMap {
  if (!Number.isFinite(localTimeMs) || localTimeMs < 0) throw new RangeError('Trajectory time must be finite and non-negative.')
  if (!scene.timelines.some(timeline => timeline.id === timelineId)) throw new Error('Trajectory timeline no longer exists.')
  return evaluateSceneFrame(scene, localTimeMs, { externalTime: { timelineId, localTimeMs } }).overrides
}

/** Project the rendered anchor at this key/sample's own local time. Ordinary
 * animated parents, reflected/nonuniform transforms and other timeline parent
 * clocks use exactly the same override map as the authoring canvas. No current
 * playhead matrix is reused for historical keys. Invalid projections return null. */
export function projectTrajectoryPosition(context: TrajectoryContext, localTimeMs: number): TrajectorySample | null {
  if (context.capability.previewable === false || !Number.isFinite(localTimeMs) || localTimeMs < 0) return null
  const frame = evaluateTrajectoryFrame(context.scene, context.timeline.id, localTimeMs)
  const display = resolveDisplayTransform(context.layer, context.scene, localTimeMs, frame, undefined, context.index)
  const matrix = resolveLayerWorldMatrix(context.layer, context.scene, localTimeMs, frame, context.index)
  const world = matrix.applyToPoint({ x: context.layer.transform.anchorX, y: context.layer.transform.anchorY })
  if (![world.x, world.y, display.x, display.y].every(Number.isFinite)) return null
  return { timeMs: localTimeMs, world, local: { x: display.x, y: display.y } }
}

/** Convert a composition-space anchor position to transform.x/y at the SAME
 * key time. The inverse parent matrix removes parent motion; subtracting the
 * authored local anchor keeps the pivot fixed. Read-only contexts, singular
 * parents and non-finite inputs return null rather than writing driven outputs. */
export function trajectoryPositionFromWorld(context: TrajectoryContext, localTimeMs: number,
  world: Readonly<TrajectoryPoint>): TrajectoryPoint | null {
  if (!context.capability.editable || ![world.x, world.y, localTimeMs].every(Number.isFinite) || localTimeMs < 0) return null
  const frame = evaluateTrajectoryFrame(context.scene, context.timeline.id, localTimeMs)
  const parent = context.layer.parentId ? context.index.get(context.layer.parentId) : undefined
  const matrix = parent ? resolveLayerWorldMatrix(parent, context.scene, localTimeMs, frame, context.index) : Matrix2D.identity()
  if (!matrix.toArray().every(Number.isFinite) || Math.abs(matrix.determinant()) < 1e-9) return null
  const local = matrix.invert().applyToPoint(world)
  const position = { x: local.x - context.layer.transform.anchorX, y: local.y - context.layer.transform.anchorY }
  return [position.x, position.y].every(Number.isFinite) ? position : null
}

import type { ChronoScene } from '../../../types'
import type { OverrideMap } from '../../../evaluator'
import { assertFilletSettings, FILLET_LIMITS, type FilletResult, type FilletSettings } from '../../../spline/fillet'
import { prepareSplineCornerEdit } from '../corners/cornerPlan'

/** Radius adapter over shared native topology ownership. A paused source frame
 * and stable point selection are required; no coordinate-key baking/migration.
 * The plan preserves every unrelated animation and contributes one Undo step. */
export function prepareSplineFillet(scene: ChronoScene, layerId: string, ids: readonly string[], settings: FilletSettings, timeMs: number, overrides?: OverrideMap) {
  assertFilletSettings(settings)
  const plan = prepareSplineCornerEdit(scene, layerId, ids, timeMs, overrides, 'Fillet', FILLET_LIMITS.points)
  return { request: { ...plan.request, ...settings }, command: (result: FilletResult) => plan.command(result) }
}

import type { ChronoScene } from '../../../types'
import type { OverrideMap } from '../../../evaluator'
import { assertChamferSettings, type ChamferResult, type ChamferSettings } from '../../../spline/chamfer'
import { prepareSplineCornerEdit } from '../corners/cornerPlan'

/** Chamfer settings adapter; native source/references/Undo policy is shared
 * with Fillet. Existing public plan/worker result contract stays compatible. */
export function prepareSplineChamfer(scene: ChronoScene, layerId: string, ids: readonly string[], settings: ChamferSettings, timeMs: number, overrides?: OverrideMap) {
  assertChamferSettings(settings)
  const plan = prepareSplineCornerEdit(scene, layerId, ids, timeMs, overrides, 'Chamfer')
  return { request: { ...plan.request, ...settings }, command: (result: ChamferResult) => plan.command(result) }
}

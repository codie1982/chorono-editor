import type { SplinePathData } from '../../types/spline'
import { targetSetting } from '../settings'

/** Modifier scope is explicit Objects or all stage-input Objects when omitted
 * through the empty-list setting. Missing explicit targets never expand to all;
 * selection topology is additionally admitted by the shared SplineModifier. */
export function modifierObjectTargets(data: SplinePathData, settings: Readonly<Record<string, unknown>>): string[] {
  const requested = targetSetting(settings, 'objectIds'), ids = requested.length ? requested : Object.keys(data.subShapes)
  if (!ids.length || ids.some(id => !data.subShapes[id])) throw new Error('Choose existing Objects from this modifier’s input.')
  return ids
}

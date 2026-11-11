import type { ChronoScene } from '../types'
import { evaluateTimelines, type OverrideMap } from '../evaluator'
import { applyParamBindingsToOverrides, buildParamValues, type ParamValueMap } from './paramResolver'
import { evaluateBindings } from './bindingEvaluator'
import { propertyExpressionEvaluator, type ExpressionClock, type SceneDriverResult } from '../expression/properties/evaluatePropertyExpressions'

export interface SceneFrameOptions extends Omit<ExpressionClock, 'globalTimeMs'> {
  /** Stateful host's already evaluated SM/timeline map; never ticked again. */
  readonly baseOverrides?: OverrideMap
  /** Host-resolved parameter frame. Defaults are used only when absent. */
  readonly paramValues?: ParamValueMap
}
export interface SceneFrameResult extends SceneDriverResult {
  readonly paramValues: ParamValueMap
  readonly wireSourceOverrides: OverrideMap
}

/** Deterministic shared scene-property frame in composition milliseconds.
 * Order: timelines/host base → parameter bindings → linear bindings → jointly
 * planned Wire/live-expression drivers. Does not advance a clock, SM or event
 * queue and never writes source/history. Hosts own any stateful base/parameters;
 * offline renderer/export uses explicit time and authored defaults. */
export function evaluateSceneFrame(scene: ChronoScene, timeMs: number, options: SceneFrameOptions = {}): SceneFrameResult {
  const base = options.baseOverrides ?? evaluateTimelines(scene.timelines, timeMs, options.externalTime)
  const paramValues = options.paramValues ?? buildParamValues(scene.parameters ?? [], new Map())
  const parameters = applyParamBindingsToOverrides(scene.layers, paramValues, base)
  const bindings = evaluateBindings(scene.bindings ?? [], parameters, paramValues, scene)
  return { ...propertyExpressionEvaluator.evaluate(scene, bindings, paramValues, { ...options, globalTimeMs: timeMs }),
    wireSourceOverrides: bindings, paramValues }
}

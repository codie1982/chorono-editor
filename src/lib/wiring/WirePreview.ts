import type { ChronoScene, ParameterWire } from '../types'
import type { OverrideMap } from '../evaluator'
import { buildParamValues, type ParamValueMap } from '../runtime/paramResolver'
import { readWireSource } from './WireSource'
import { paramRefKey } from './helpers'
import { inspectExpression } from '../core/expression/expressionEvaluator'
import { blockedWireIds, clampWireValue } from './WireValidation'
import { readPropertyPath } from '../scene/properties/readPropertyPath'

/** Inspect a candidate using the same pre-wire frame, numeric source contract,
 * safe evaluator and clamp as playback. Existing wire is replaced only in the
 * borrowed dependency check. No source mutation/cache/guessed source zero.
 * Without a runtime frame the explicit static/default fallback is used.
 */
export function inspectWire(wire: ParameterWire, scene: ChronoScene, overrides: OverrideMap = new Map(),
  params: ParamValueMap = buildParamValues(scene.parameters, new Map())) {
  const source = readWireSource(wire.source, overrides, params, scene.layers)
  try {
    if (wire.target.valueType !== 'number' || !wire.target.layerId || wire.target.modifierId) throw new Error('Choose an existing numeric layer property as the target.')
    const target = scene.layers.find(layer => layer.id === wire.target.layerId)
    if (!target || typeof readPropertyPath(target, wire.target.propertyPath) !== 'number') throw new Error('The target has no numeric source property.')
    if (wire.enabled && scene.parameterWires?.some(item => item.id !== wire.id && item.enabled && paramRefKey(item.target) === paramRefKey(wire.target))) throw new Error('Another enabled wire already drives this target. Edit or disable that wire first.')
    if (blockedWireIds([...(scene.parameterWires ?? []).filter(item => item.id !== wire.id), wire]).has(wire.id)) throw new Error('This wire creates or depends on a cycle.')
    if (source === null) throw new Error('Source has no finite numeric value.')
    const result = inspectExpression(wire.expression, { source, s: source })
    if (result.error || result.value === null) throw new Error(result.error ?? 'Expression has no finite result.')
    return { source, value: clampWireValue(result.value, wire.clamp), error: null }
  } catch (error) { return { source, value: null, error: `${error instanceof Error ? error.message : String(error)} Target keeps its pre-wire value.` } }
}

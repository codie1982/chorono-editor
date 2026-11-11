import type { ParameterRef } from '../../types'
import type { OverrideMap } from '../../evaluator'
import type { ParamValueMap } from '../../runtime/paramResolver'
import type { LayerLookup } from '../../scene/LayerIndex'
import { readReferencedValue } from '../../wiring/WireSource'
import { layerRegistry } from '../../registry'
import type { ExpressionScalar } from '../../core/expression/expressionEvaluator'

/** Resolve one executed named source, with exact scalar types and registered
 * optional-field defaults. Missing references remain errors; a schema default
 * does not invent a layer. Called lazily by the interpreter's own context
 * getter so skipped conditional/logical branches do not read missing values.
 * No source mutation, coercion, caching or clock is owned here. */
export function readPropertyExpressionSource(ref: ParameterRef, frame: OverrideMap, params: ParamValueMap, layers: LayerLookup): ExpressionScalar {
  let value = readReferencedValue(ref, frame, params, layers)
  if (value === undefined && ref.layerId) {
    const layer = layers.get(ref.layerId)
    const schema = layer && layerRegistry.findForLayer(layer)?.getPropertyGroups?.(layer).flatMap(group => group.schemas).find(field => field.path === ref.propertyPath)
    value = schema?.defaultValue
  }
  if (typeof value !== ref.valueType || typeof value === 'number' && !Number.isFinite(value)) throw new Error(ref.valueType === 'number' ? 'Source has no finite numeric value.' : 'Source has no boolean value.')
  return value as ExpressionScalar
}

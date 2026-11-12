import type { ParameterRef } from '../../types'
import type { OverrideMap } from '../../evaluator'
import type { ParamValueMap } from '../../runtime/paramResolver'
import type { LayerLookup } from '../../scene/LayerIndex'
import { readReferencedValue } from '../../wiring/WireSource'
import { expressionPropertyDefault } from './PropertyExpressionCapability'
import { expressionValueType, type ExpressionValue } from '../../core/expression/ExpressionValue'
import { parseAnimatableColor } from '../../color/ColorValue'
import { isVec2 } from '../../geometry/CoordinateSystem'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'

/** Resolve one executed named source, with exact scalar types and registered
 * optional-field defaults. Missing references remain errors; a schema default
 * does not invent a layer. Called lazily by the interpreter's own context
 * getter so skipped conditional/logical branches do not read missing values.
 * No source mutation, coercion, caching or clock is owned here. */
export function readPropertyExpressionSource(ref: ParameterRef, frame: OverrideMap, params: ParamValueMap, layers: LayerLookup): ExpressionValue {
  let value = readReferencedValue(ref, frame, params, layers)
  if (ref.layerId && !frame.has('layers.' + ref.layerId + '.' + ref.propertyPath)) {
    const parts = ref.propertyPath.split('.')
    for (let length = parts.length - 1; length > 0; length--) {
      const parent = frame.get('layers.' + ref.layerId + '.' + parts.slice(0, length).join('.'))
      if (parent !== undefined) { value = readPropertyPath(parent, parts.slice(length).join('.')); break }
    }
  }
  if (value === undefined && ref.layerId) {
    const layer = layers.get(ref.layerId)
    value = layer && expressionPropertyDefault(layer, ref.propertyPath)
  }
  if (ref.valueType === 'color') value = parseAnimatableColor(value)
  if (ref.valueType === 'vec2' && isVec2(value)) value = {
    x: frame.get('layers.' + ref.layerId + '.' + ref.propertyPath + '.x') ?? value.x,
    y: frame.get('layers.' + ref.layerId + '.' + ref.propertyPath + '.y') ?? value.y,
  }
  if (expressionValueType(value) !== ref.valueType) throw new Error(ref.valueType === 'number' ? 'Source has no finite numeric value.' : 'Source has no valid ' + ref.valueType + ' value.')
  return value as ExpressionValue
}

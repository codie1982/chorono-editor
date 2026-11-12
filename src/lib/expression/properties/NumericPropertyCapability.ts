import type { Layer } from '../../types'
import type { NumericConstraints } from '../../core/expression/NumericResult'
import { propertyExpressionConstraints } from './PropertyExpressionCapability'

/** Compatible numeric entry point. The shared schema owner validates path,
 * type and limits; editor/config callers separately decide lifecycle. */
export function numericPropertyConstraints(layer: Layer, path: string): NumericConstraints {
  return propertyExpressionConstraints(layer, path, 'number', 'constant')
}

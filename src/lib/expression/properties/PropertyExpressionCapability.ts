import type { Layer } from '../../types'
import { layerRegistry } from '../../registry'
import { numericPropertyConstraints } from './NumericPropertyCapability'
import type { NumericConstraints } from '../../core/expression/NumericResult'

export type ScalarExpressionType = 'number' | 'boolean'
export interface ScalarPropertyConstraints extends NumericConstraints { readonly defaultValue?: number | boolean }
/** Match a declared result to its source leaf. A3 visual booleans cover text
 * case/decoration and path closure; drawing and bounds consume those fields.
 * Media/solver toggles require A4 lifecycle adapters before live formulas.
 * This pure capability query executes nothing and does not enforce edit locks. */
export function propertyExpressionConstraints(layer: Layer, path: string, kind: ScalarExpressionType): ScalarPropertyConstraints {
  if (kind === 'number') return numericPropertyConstraints(layer, path)
  const schema = layerRegistry.findForLayer(layer)?.getPropertyGroups?.(layer).flatMap(group => group.schemas).find(field => field.path === path)
  if (!['text.uppercase', 'text.underline', 'path.closed'].includes(path) || schema?.valueType !== 'boolean') throw new Error('Live formulas are not supported for this control yet.')
  return { defaultValue: false }
}

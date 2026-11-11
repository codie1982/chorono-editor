import type { Layer } from '../../types'
import type { NumericConstraints } from '../../core/expression/NumericResult'
import { layerRegistry } from '../../registry'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'

/** Numeric source capability independent of locks/runtime handles. Structural
 * IDs/topology/array entries are excluded. A schema default may supply an absent
 * optional leaf. Inclusive limits are in the registered property's source units. */
export function numericPropertyConstraints(layer: Layer, path: string): NumericConstraints {
  if (path.length > 256) throw new Error('Numeric formula path exceeds 256 characters.')
  if (!/^(transform\.[A-Za-z]+|size\.(width|height)|opacity|shapeParams\.[A-Za-z]+|style\.[A-Za-z.]+|text\.[A-Za-z]+|effects\.[A-Za-z]+)$/.test(path)) throw new Error('This field is not a numeric formula target yet.')
  const groups = layerRegistry.findForLayer(layer)?.getPropertyGroups?.(layer) ?? []
  const schema = groups.flatMap(group => group.schemas).find(item => item.path === path)
  if (schema && !['number', 'angle', 'percent'].includes(schema.valueType)) throw new Error('This schema field is not numeric.')
  const value = readPropertyPath(layer, path)
  if (typeof value !== 'number' && (!schema || !['number', 'angle', 'percent'].includes(schema.valueType))) throw new Error('This source field is not numeric.')
  return { min: schema?.min, max: schema?.max }
}

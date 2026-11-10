import type { Layer, ParameterRef } from '../types'
import type { OverrideMap } from '../evaluator'
import type { ParamValueMap } from '../runtime/paramResolver'
import { readPropertyPath } from '../scene/properties/readPropertyPath'
import { paramRefKey } from './helpers'

/** Legacy scene-parameter coercion: finite numbers, boolean 0/1 and non-empty
 * numeric strings. Layer animation values retain their typed scalar gate. */
function numericSource(value: unknown): number | null {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) { const number = Number(value); return Number.isFinite(number) ? number : null }
  return null
}

/** Resolve finite numeric layer values from the pre-wire evaluated frame,
 * then static source; discrete/string/vector/color overrides never coerce into
 * scalar layer inputs. Scene parameters retain legacy numeric coercion.
 * Shared by runtime and editor preview; aliases/expressions belong
 * to the evaluator. Modifier sources require an actual evaluated override.
 * Borrows all inputs; unsafe/missing own-property paths fail with null. */
export function readWireSource(source: ParameterRef, overrides: OverrideMap, params: ParamValueMap, layers: readonly Layer[]): number | null {
  if (!source.layerId) return numericSource(params.get(source.propertyPath))
  const key = paramRefKey(source)
  if (overrides.has(key)) { const value = overrides.get(key); return typeof value === 'number' && Number.isFinite(value) ? value : null }
  if (source.modifierId) return null
  const layer = layers.find(item => item.id === source.layerId)
  if (!layer) return null
  try { const value = readPropertyPath(layer, source.propertyPath); return typeof value === 'number' && Number.isFinite(value) ? value : null } catch { return null }
}

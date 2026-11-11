import type { Layer, ParameterRef } from '../types'
import type { OverrideMap } from '../evaluator'
import type { ParamValueMap } from '../runtime/paramResolver'
import { readPropertyPath } from '../scene/properties/readPropertyPath'
import { paramRefKey } from './helpers'
import type { LayerLookup } from '../scene/LayerIndex'

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
export function readWireSource(source: ParameterRef, overrides: OverrideMap, params: ParamValueMap, layers: readonly Layer[] | LayerLookup): number | null {
  if (!source.layerId) return numericSource(params.get(source.propertyPath))
  const value = readReferencedValue(source, overrides, params, layers)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Borrow an exact typed referenced value. Overrides win; absent modifier
 * outputs stay missing. The lookup adapter avoids repeated full scene scans
 * for compiled expression graphs. No boolean/string coercion occurs here. */
export function readReferencedValue(source: ParameterRef, overrides: OverrideMap, params: ParamValueMap, layers: readonly Layer[] | LayerLookup): unknown {
  const key = paramRefKey(source)
  if (overrides.has(key)) return overrides.get(key)
  if (!source.layerId) return params.get(source.propertyPath)
  if (source.modifierId) return undefined
  const layer = 'get' in layers ? layers.get(source.layerId) : layers.find(item => item.id === source.layerId)
  if (!layer) return undefined
  try { return readPropertyPath(layer, source.propertyPath) } catch { return undefined }
}

import type { PropertyExpressions } from './PropertyExpression'

/** Copy only stable layer references internal to a cloned forest. External
 * layer, parameter and timeline IDs keep their existing identity. Formula
 * identifiers are variable names, never rewritten with text replacement. */
export function remapPropertyExpressions(data: PropertyExpressions | undefined, ids: Readonly<Record<string, string>>): PropertyExpressions | undefined {
  if (!data) return undefined
  return { version: 1, fields: Object.fromEntries(Object.entries(data.fields).map(([path, value]) => [path, {
    ...value, sources: Object.fromEntries(Object.entries(value.sources).map(([name, ref]) => [name, {
      ...ref, ...(ref.layerId && Object.prototype.hasOwnProperty.call(ids, ref.layerId) ? { layerId: ids[ref.layerId] } : {}),
    }])),
  }])) }
}

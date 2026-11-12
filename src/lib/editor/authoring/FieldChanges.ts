import { authoringKey, omitsEntityField, type SourceEntity } from './SourceEntities'

/** Structural JSON field diff for one entity. Unchanged references short-circuit;
 * detached equal scripts produce no writes. Objects recurse; arrays are atomic
 * (legacy point arrays are not stable IDs). Missing versus undefined is equal.
 * Depth >32 falls back to the containing field, never fabricates a leaf identity.
 * No values, copies or array indices are retained in the result.
 */
export function changedEntityFields(before: SourceEntity, after: SourceEntity): string[] {
  const fields: string[] = []
  const equal = (a: unknown, b: unknown): boolean => {
    if (a === b) return true
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>
    const keys = Object.keys(left).filter(key => left[key] !== undefined)
    return keys.length === Object.keys(right).filter(key => right[key] !== undefined).length && keys.every(key => equal(left[key], right[key]))
  }
  const visit = (a: unknown, b: unknown, path: string[]): void => {
    if (omitsEntityField(after, path) || a === b) return
    const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
    if (path.length < 32 && (record(a) || record(b)) && (a === undefined || record(a)) && (b === undefined || record(b))) {
      for (const key of Array.from(new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]))) visit(a?.[key], b?.[key], [...path, key])
    } else if (!equal(a, b)) fields.push(authoringKey(path))
  }
  visit(before.value, after.value, [])
  return fields
}

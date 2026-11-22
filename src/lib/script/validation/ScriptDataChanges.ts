/** Compare admitted JSON source without serialization or mutating either value.
 * Array order matters; object key order does not. Shared references are cheap. */
export function sameScriptValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return false
  const left = Object.keys(a), right = Object.keys(b)
  return left.length === right.length && left.every(key => Object.prototype.hasOwnProperty.call(b, key)
    && sameScriptValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

/** Changed layer-relative leaves, including removals. Arrays are atomic so a
 * replacement acquires ownership of all their indexed descendants. No mutation. */
export function changedScriptPaths(a: unknown, b: unknown, prefix = ''): string[] {
  if (sameScriptValue(a, b)) return []
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return [prefix]
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).flatMap(key => changedScriptPaths(
    (a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key))
}

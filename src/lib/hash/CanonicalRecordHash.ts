/**
 * Hashes an ordered sequence of caller-canonicalized records.
 *
 * Callers own field order, numeric formatting and semantic versioning. Scope
 * and records may not contain the unit separator, preventing concatenation
 * ambiguity. Two seeded FNV-1a passes provide a compact browser-portable change
 * detector; this is not a cryptographic integrity checksum.
 */
export function hashCanonicalRecords(scope: string, records: readonly string[]): string {
  const separator = '\u001f'
  if (scope.includes(separator) || records.some(record => record.includes(separator))) {
    throw new Error('Canonical hash input contains a reserved separator')
  }
  const canonical = [scope, ...records].join(separator)
  return `${fnv1a32(canonical, 0x811c9dc5)}${fnv1a32(canonical, 0x9e3779b9)}`
}

/** FNV-1a over UTF-16 code units; output is a fixed-width lowercase word. */
function fnv1a32(value: string, initial: number): string {
  let hash = initial >>> 0
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

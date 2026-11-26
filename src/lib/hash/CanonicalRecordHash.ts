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

/**
 * Serializes portable JSON-like data with deterministic object-key ordering.
 *
 * Arrays preserve authored order, undefined object fields are omitted and
 * non-finite numbers or non-JSON values fail explicitly. The helper does not
 * clone or mutate its input. It is intended for content-change hashes, not as
 * a persistence serializer or a cryptographic signature.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON contains a non-finite number')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new Error('Canonical JSON contains a non-portable value')
}

/** FNV-1a over UTF-16 code units; output is a fixed-width lowercase word. */
function fnv1a32(value: string, initial: number): string {
  let hash = initial >>> 0
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

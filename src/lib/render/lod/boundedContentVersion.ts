/** Exact native JSON version with a conservative traversal/UTF-16 size guard.
 * The replacer runs before string escaping; oversized strings/graphs abort
 * without building an unbounded cache key. No hash collisions or mutation.
 * Valid scene JSON is assumed (no custom toJSON). Cycles/depth/serialization
 * failure return null, allowing ordinary rendering. Limit counts escaped keys,
 * strings and conservative scalar/token overhead rather than retained heap RAM. */
export function boundedContentVersion(value: unknown, maxChars: number): string | null {
  let estimate = 0
  try {
    return JSON.stringify(value, (key, item) => {
      estimate += key.length * 6 + (typeof item === 'string' ? item.length * 6 : 32) + 8
      if (estimate > maxChars) throw new RangeError('LOD content version limit')
      return item
    }) ?? null
  } catch { return null }
}

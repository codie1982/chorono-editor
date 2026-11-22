/** Rounds to a fixed precision and strips trailing zeros for compact output. */
export function num(n: number, precision = 2): string {
  if (!Number.isFinite(n)) return '0'
  return parseFloat(n.toFixed(precision)).toString()
}

/** Escapes a string for safe inclusion in an XML attribute value. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}


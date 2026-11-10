import { createBuildInfo } from './createBuildInfo'

/** Compare validated SemVer precedence (-1/0/1); build metadata has no effect.
 * Validation reuses createBuildInfo. Numeric identifiers are compared as digit
 * strings, avoiding precision loss on large legal versions. This function is
 * deterministic and platform-free; malformed versions throw RangeError.
 * See https://semver.org/#spec-item-11 for the ordering rules. */
export function compareSemanticVersions(left: string, right: string): -1 | 0 | 1 {
  createBuildInfo(left); createBuildInfo(right)
  const parts = (value: string) => {
    const source = value.split('+')[0], dash = source.indexOf('-')
    return { core: (dash < 0 ? source : source.slice(0, dash)).split('.'),
      pre: dash < 0 ? [] : source.slice(dash + 1).split('.') }
  }
  const a = parts(left), b = parts(right)
  for (let index = 0; index < 3; index++) {
    const order = compareNumeric(a.core[index], b.core[index]); if (order) return order
  }
  if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index++) {
    const x = a.pre[index], y = b.pre[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y)
    if (xn && yn) return compareNumeric(x, y)
    if (xn !== yn) return xn ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

/** Compare canonical nonnegative integer strings without number conversion. */
function compareNumeric(a: string, b: string): -1 | 0 | 1 {
  return a === b ? 0 : a.length !== b.length ? (a.length < b.length ? -1 : 1) : a < b ? -1 : 1
}

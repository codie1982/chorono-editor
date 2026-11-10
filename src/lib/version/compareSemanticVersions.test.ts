import { expect, it } from 'vitest'
import { compareSemanticVersions } from './compareSemanticVersions'

it('compares SemVer precedence without numeric precision loss or build metadata bias', () => {
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta',
    '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '2.0.0']
  ordered.slice(1).forEach((version, i) => {
    expect(compareSemanticVersions(ordered[i], version)).toBe(-1)
    expect(compareSemanticVersions(version, ordered[i])).toBe(1)
  })
  expect(compareSemanticVersions('1.0.0+build.9', '1.0.0+build.1')).toBe(0)
  expect(compareSemanticVersions('99999999999999999.0.0', '99999999999999998.0.0')).toBe(1)
  expect(() => compareSemanticVersions('invalid', '1.0.0')).toThrow()
})

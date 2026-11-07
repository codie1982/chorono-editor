import { expect, it } from 'vitest'
import { formatBytes } from './formatBytes'

it('uses explicit binary units for pool budgets and asset file sizes', () => {
  expect(formatBytes(96 * 1024 ** 2)).toBe('96.0 MiB')
  expect(formatBytes(1536)).toBe('1.5 KiB')
  expect(formatBytes(37 * 1024 ** 3)).toBe('37.0 GiB')
  expect(formatBytes(0)).toBe('0 B')
  expect(formatBytes(NaN)).toBe('—')
})

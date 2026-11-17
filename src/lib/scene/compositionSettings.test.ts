import { describe, expect, it } from 'vitest'
import { compositionSettingsValid } from './compositionSettings'

const source = { width: 1920, height: 1080, frameRate: 29.97, durationMs: 12500 }
describe('portable composition settings', () => {
  it('accepts fractional FPS, stills and existing inclusive source limits without mutation', () => {
    expect(compositionSettingsValid(Object.freeze(source))).toBe(true)
    expect(compositionSettingsValid({ width: 1, height: 8192, frameRate: 120, durationMs: 3600000 })).toBe(true)
    expect(compositionSettingsValid({ ...source, durationMs: 0 })).toBe(true)
  })
  it.each([
    { width: 0 }, { width: 8193 }, { height: -1 }, { frameRate: 0 }, { frameRate: 121 },
    { durationMs: -1 }, { durationMs: 3600001 }, { durationMs: NaN }, { frameRate: Infinity },
  ])('rejects unsupported/nonfinite settings %j', patch => {
    expect(compositionSettingsValid({ ...source, ...patch })).toBe(false)
  })
})

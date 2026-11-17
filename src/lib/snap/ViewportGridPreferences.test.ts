import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEWPORT_GRID, decodeViewportGrid, readViewportGrid, writeViewportGrid } from './ViewportGridPreferences'

describe('viewport grid preference persistence', () => {
  it('round-trips only versioned presentation fields, including false and fractional pixels', () => {
    const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    const preferences = { visible: true, inFront: false, sizePx: 37.5 }
    expect(writeViewportGrid(storage, preferences)).toBe(true)
    expect(readViewportGrid(storage)).toEqual(preferences)
    expect(JSON.parse(Array.from(values.values())[0])).toEqual({ version: 1, ...preferences })
  })
  it('rejects malformed, unsupported and nonfinite/out-of-range persisted input', () => {
    for (const raw of [null, '{bad', '{"version":2,"visible":true}', 'null']) expect(decodeViewportGrid(raw)).toEqual(DEFAULT_VIEWPORT_GRID)
    expect(decodeViewportGrid('{"version":1,"visible":true,"inFront":"yes","sizePx":0}')).toEqual({ ...DEFAULT_VIEWPORT_GRID, visible: true })
    expect(decodeViewportGrid('{"version":1,"sizePx":1e309}').sizePx).toBe(20)
  })
  it('contains storage failures so editing remains available', () => {
    const denied = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') } }
    expect(readViewportGrid(denied)).toEqual(DEFAULT_VIEWPORT_GRID)
    expect(writeViewportGrid(denied, DEFAULT_VIEWPORT_GRID)).toBe(false)
  })
})

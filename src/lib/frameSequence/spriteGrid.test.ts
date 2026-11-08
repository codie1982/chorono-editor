import { describe, expect, it } from 'vitest'
import { buildSpriteGrid, type SpriteGridInput } from './spriteGrid'

const source: SpriteGridInput = { imageWidth: 101, imageHeight: 53, columns: 4, rows: 2 }

describe('sprite-grid source validation', () => {
  it('preserves partial rows, integer pixel cells and historical defaults', () => {
    expect(buildSpriteGrid('sheet', { ...source, frameCount: 7, fps: -2 })).toMatchObject({
      assetId: 'sheet', frameWidth: 25, frameHeight: 26, frameCount: 7, fps: 12, loop: true,
    })
    expect(buildSpriteGrid('sheet', { ...source, columns: -2, rows: 0, frameCount: 0 })).toMatchObject({ columns: 1, rows: 1, frameCount: 1 })
  })
  it('bounds frame count by cells and supports dense grids without per-frame data', () => {
    expect(buildSpriteGrid('sheet', { ...source, frameCount: 1000 }).frameCount).toBe(8)
    const dense = buildSpriteGrid('sheet', { imageWidth: 16384, imageHeight: 16384, columns: 16384, rows: 16384 })
    expect(dense.frameCount).toBe(268435456); expect(JSON.stringify(dense).length).toBeLessThan(300)
  })
  it.each(['imageWidth', 'imageHeight', 'columns', 'rows', 'frameCount', 'fps'] as const)('rejects non-finite %s', key => {
    for (const value of [Infinity, NaN]) expect(() => buildSpriteGrid('sheet', { ...source, [key]: value })).toThrow()
  })
  it('rejects invalid source dimensions, unsafe products and subpixel cells before they enter a scene', () => {
    for (const input of [{ imageWidth: 0 }, { imageHeight: 1.5 }, { columns: 102 }, { rows: 54 },
      { imageWidth: Number.MAX_SAFE_INTEGER, imageHeight: 2, columns: Number.MAX_SAFE_INTEGER, rows: 2 }]) {
      expect(() => buildSpriteGrid('sheet', { ...source, ...input })).toThrow()
    }
  })
})

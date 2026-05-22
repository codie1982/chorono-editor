import { describe, it, expect } from 'vitest'
import { buildSpriteGrid } from '../spriteGrid'

describe('buildSpriteGrid', () => {
  it('derives cell size by integer-dividing the image', () => {
    const g = buildSpriteGrid('a1', { imageWidth: 256, imageHeight: 128, columns: 4, rows: 2 })
    expect(g.frameWidth).toBe(64)
    expect(g.frameHeight).toBe(64)
    expect(g.columns).toBe(4)
    expect(g.rows).toBe(2)
  })

  it('defaults frameCount to columns*rows', () => {
    const g = buildSpriteGrid('a1', { imageWidth: 100, imageHeight: 100, columns: 3, rows: 3 })
    expect(g.frameCount).toBe(9)
  })

  it('clamps an explicit frameCount to [1, columns*rows] (partial last row)', () => {
    expect(buildSpriteGrid('a1', { imageWidth: 100, imageHeight: 100, columns: 4, rows: 2, frameCount: 7 }).frameCount).toBe(7)
    expect(buildSpriteGrid('a1', { imageWidth: 100, imageHeight: 100, columns: 4, rows: 2, frameCount: 99 }).frameCount).toBe(8)
    expect(buildSpriteGrid('a1', { imageWidth: 100, imageHeight: 100, columns: 4, rows: 2, frameCount: 0 }).frameCount).toBe(1)
  })

  it('floors fractional columns/rows and enforces a minimum of 1', () => {
    const g = buildSpriteGrid('a1', { imageWidth: 100, imageHeight: 100, columns: 0, rows: -3 })
    expect(g.columns).toBe(1)
    expect(g.rows).toBe(1)
  })

  it('defaults fps to 12 when missing or non-positive', () => {
    expect(buildSpriteGrid('a1', { imageWidth: 64, imageHeight: 64, columns: 1, rows: 1 }).fps).toBe(12)
    expect(buildSpriteGrid('a1', { imageWidth: 64, imageHeight: 64, columns: 1, rows: 1, fps: 0 }).fps).toBe(12)
    expect(buildSpriteGrid('a1', { imageWidth: 64, imageHeight: 64, columns: 1, rows: 1, fps: 24 }).fps).toBe(24)
  })

  it('defaults loop to true and objectFit to contain', () => {
    const g = buildSpriteGrid('a1', { imageWidth: 64, imageHeight: 64, columns: 2, rows: 2 })
    expect(g.loop).toBe(true)
    expect(g.objectFit).toBe('contain')
    expect(g.assetId).toBe('a1')
  })
})

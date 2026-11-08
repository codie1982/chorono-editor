import { describe, expect, it } from 'vitest'
import { clampMoveToComposition } from './moveBounds'

describe('move bounds with centered spline geometry', () => {
  it('keeps the entire circle visible at every composition edge', () => {
    expect(clampMoveToComposition(-20, -40, 160, 160, 960, 540, -80, -80)).toEqual({ x: 80, y: 80 })
    expect(clampMoveToComposition(1000, 600, 160, 160, 960, 540, -80, -80)).toEqual({ x: 880, y: 460 })
  })

  it('does not shift an in-bounds circle when drag starts', () => {
    expect(clampMoveToComposition(300, 200, 160, 160, 960, 540, -80, -80)).toEqual({ x: 300, y: 200 })
  })

  it('preserves ordinary top-left layer clamping', () => {
    expect(clampMoveToComposition(1000, -5, 160, 80, 960, 540)).toEqual({ x: 800, y: 0 })
  })

  it('keeps a stable position when the object is larger than the composition', () => {
    expect(clampMoveToComposition(20, 50, 1200, 800, 960, 540, -600, -400)).toEqual({ x: 600, y: 400 })
  })
})

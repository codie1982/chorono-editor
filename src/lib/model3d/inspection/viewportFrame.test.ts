import { describe, expect, it } from 'vitest'
import { viewportFrameSize } from './viewportFrame'

describe('3D viewport frame', () => {
  it('fits square and output aspects inside the available CSS box', () => {
    expect(viewportFrameSize(800, 400, 'fill', 16 / 9)).toEqual({ width: 800, height: 400 })
    expect(viewportFrameSize(800, 400, 'square', 16 / 9)).toEqual({ width: 400, height: 400 })
    expect(viewportFrameSize(300, 500, 'output', 16 / 9)).toEqual({ width: 300, height: 168.75 })
    expect(viewportFrameSize(800, 400, 'output', 16 / 9)).toEqual({ width: 400 * 16 / 9, height: 400 })
  })
})

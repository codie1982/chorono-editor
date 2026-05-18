import { describe, it, expect } from 'vitest'
import { solvePathArray } from '../PathArraySolver'
import { defaultPathArraySettings } from '../ArrayTypes'
import type { Layer } from '../../types'

function makeRect(): Layer {
  return {
    id: 'rect',
    name: 'Rect',
    type: 'shape',
    shape: 'rect',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
  }
}

function makeStraightPath(): Layer {
  // A horizontal line from (0,0) → (100,0), 4 anchors so length = 100.
  return {
    id: 'path1',
    name: 'Line',
    type: 'path',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    path: {
      anchors: [
        { x: 0,   y: 0, pointType: 'corner' },
        { x: 100, y: 0, pointType: 'corner' },
      ],
      closed: false,
    },
  }
}

describe('PathArraySolver', () => {
  it('returns empty array when path layer is missing', () => {
    const src = makeRect()
    const settings = defaultPathArraySettings('nope')
    expect(solvePathArray(src, settings, [src])).toEqual([])
  })

  it('returns empty array when count <= 0', () => {
    const src = makeRect()
    const pathLayer = makeStraightPath()
    const settings = { ...defaultPathArraySettings(pathLayer.id), count: 0 }
    expect(solvePathArray(src, settings, [src, pathLayer])).toEqual([])
  })

  it('distributes N instances along a straight 100px line', () => {
    const src = makeRect()
    const pathLayer = makeStraightPath()
    const settings = {
      ...defaultPathArraySettings(pathLayer.id),
      count: 3,
      sourcePolicy: 'clone-source-too' as const,
      alignToTangent: false,
    }
    const out = solvePathArray(src, settings, [src, pathLayer])
    expect(out).toHaveLength(3)
    // Expect approximately even spacing along the line (0, 50, 100).
    expect(out[0].position.x).toBeCloseTo(0, 0)
    expect(out[1].position.x).toBeCloseTo(50, 0)
    expect(out[2].position.x).toBeCloseTo(100, 0)
  })

  it('alignToTangent sets rotation to the path tangent angle', () => {
    const src = makeRect()
    const pathLayer = makeStraightPath()
    const settings = {
      ...defaultPathArraySettings(pathLayer.id),
      count: 2,
      sourcePolicy: 'clone-source-too' as const,
      alignToTangent: true,
    }
    const out = solvePathArray(src, settings, [src, pathLayer])
    // Horizontal line → tangent points +X → 0°
    expect(out[0].rotation).toBeCloseTo(0, 0)
    expect(out[1].rotation).toBeCloseTo(0, 0)
  })

  it('reverse distributes from end → start', () => {
    const src = makeRect()
    const pathLayer = makeStraightPath()
    const settings = {
      ...defaultPathArraySettings(pathLayer.id),
      count: 3,
      sourcePolicy: 'clone-source-too' as const,
      reverse: true,
      alignToTangent: false,
    }
    const out = solvePathArray(src, settings, [src, pathLayer])
    // Reversed: index 0 → end of path, index 2 → start.
    expect(out[0].position.x).toBeCloseTo(100, 0)
    expect(out[2].position.x).toBeCloseTo(0, 0)
  })

  it('startOffset / endOffset shrink the usable span', () => {
    const src = makeRect()
    const pathLayer = makeStraightPath()
    const settings = {
      ...defaultPathArraySettings(pathLayer.id),
      count: 3,
      startOffset: 20,
      endOffset: 20,
      sourcePolicy: 'clone-source-too' as const,
      alignToTangent: false,
    }
    const out = solvePathArray(src, settings, [src, pathLayer])
    // Usable span 20..80 = 60px. 3 instances → 0, 30, 60.
    expect(out[0].position.x).toBeCloseTo(20, 0)
    expect(out[1].position.x).toBeCloseTo(50, 0)
    expect(out[2].position.x).toBeCloseTo(80, 0)
  })
})

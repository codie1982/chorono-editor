import { describe, expect, it } from 'vitest'
import type { ChronoScene, Composition, Layer } from '../../types'
import { computeDistributeTransforms, computeSpreadAcrossCanvas } from './DistributeCompute'

const composition: Composition = {
  id: 'c',
  width: 1000,
  height: 500,
  durationMs: 1000,
  frameRate: 30,
  backgroundColor: '#000',
}

const mkShape = (id: string, x: number, y: number, w = 100, h = 50): Layer => ({
  id,
  name: id,
  type: 'shape',
  shape: 'rect',
  transform: { x, y, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
  opacity: 1,
  size: { width: w, height: h },
})

const mkScene = (layers: Layer[]): ChronoScene => ({
  formatVersion: '1.0.0',
  composition,
  assets: [],
  layers,
  timelines: [],
  parameters: [],
  triggers: [],
  bindings: [],
  initialState: {},
})

describe('computeDistributeTransforms — horizontal centers', () => {
  it('evenly spaces three layer centers along X', () => {
    // centers at: a=50, b=100, c=300
    // first=50, last=300, step=125 → middle center should be 175 → dx=75
    const scene = mkScene([
      mkShape('a', 0,   0, 100, 50),
      mkShape('b', 50,  0, 100, 50),
      mkShape('c', 250, 0, 100, 50),
    ])
    const result = computeDistributeTransforms({
      layerIds: ['a', 'b', 'c'],
      axis: 'horizontal',
      mode: 'centers',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([{ layerId: 'b', dx: 75, dy: 0 }])
  })

  it('handles unordered selection — sorts by center along axis', () => {
    const scene = mkScene([
      mkShape('a', 0,   0, 100, 50),  // center 50
      mkShape('b', 50,  0, 100, 50),  // center 100
      mkShape('c', 250, 0, 100, 50),  // center 300
    ])
    // Passing IDs in reverse order — solver still anchors a (left) and c (right)
    const result = computeDistributeTransforms({
      layerIds: ['c', 'b', 'a'],
      axis: 'horizontal',
      mode: 'centers',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([{ layerId: 'b', dx: 75, dy: 0 }])
  })

  it('does nothing for < 3 layers', () => {
    const scene = mkScene([mkShape('a', 0, 0), mkShape('b', 500, 0)])
    const result = computeDistributeTransforms({
      layerIds: ['a', 'b'],
      axis: 'horizontal',
      mode: 'centers',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([])
  })
})

describe('computeDistributeTransforms — vertical centers', () => {
  it('evenly spaces centers along Y', () => {
    const scene = mkScene([
      mkShape('a', 0, 0,   50, 50),   // centerY 25
      mkShape('b', 0, 100, 50, 50),   // centerY 125
      mkShape('c', 0, 400, 50, 50),   // centerY 425
    ])
    // first=25, last=425, step=200 → middle center should be 225 → dy=100
    const result = computeDistributeTransforms({
      layerIds: ['a', 'b', 'c'],
      axis: 'vertical',
      mode: 'centers',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([{ layerId: 'b', dx: 0, dy: 100 }])
  })
})

describe('computeSpreadAcrossCanvas — horizontal', () => {
  it('pins leftmost to canvas left, rightmost to canvas right, even spacing for middles', () => {
    // Canvas 1000 wide. Three 100×50 layers clustered in the middle.
    const scene = mkScene([
      mkShape('a', 400, 0, 100, 50),  // center 450 — leftmost
      mkShape('b', 500, 0, 100, 50),  // center 550 — middle
      mkShape('c', 600, 0, 100, 50),  // center 650 — rightmost
    ])
    // Expected after spread:
    //  a: center → 50  (left edge 0)         → dx = -400
    //  c: center → 950 (right edge 1000)     → dx = 300
    //  b: center → (50 + 950)/2 = 500        → dx = -50
    const result = computeSpreadAcrossCanvas({
      layerIds: ['a', 'b', 'c'],
      axis: 'horizontal',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([
      { layerId: 'a', dx: -400, dy: 0 },
      { layerId: 'b', dx: -50,  dy: 0 },
      { layerId: 'c', dx: 300,  dy: 0 },
    ])
  })

  it('respects current world position for ordering (selection order ignored)', () => {
    const scene = mkScene([
      mkShape('a', 600, 0, 100, 50),  // rightmost in world
      mkShape('b', 400, 0, 100, 50),  // leftmost in world
      mkShape('c', 500, 0, 100, 50),  // middle in world
    ])
    // Sorted by current centerX: b (450), c (550), a (650)
    //  b: center → 50,  dx = -400
    //  c: center → 500, dx = -50
    //  a: center → 950, dx = 300
    const result = computeSpreadAcrossCanvas({
      layerIds: ['a', 'b', 'c'],
      axis: 'horizontal',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([
      { layerId: 'b', dx: -400, dy: 0 },
      { layerId: 'c', dx: -50,  dy: 0 },
      { layerId: 'a', dx: 300,  dy: 0 },
    ])
  })

  it('handles two layers — one to each canvas edge', () => {
    const scene = mkScene([
      mkShape('a', 400, 0, 100, 50),  // center 450
      mkShape('b', 500, 0, 100, 50),  // center 550
    ])
    // a → center 50 (dx -400), b → center 950 (dx 400)
    const result = computeSpreadAcrossCanvas({
      layerIds: ['a', 'b'],
      axis: 'horizontal',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([
      { layerId: 'a', dx: -400, dy: 0 },
      { layerId: 'b', dx: 400,  dy: 0 },
    ])
  })

  it('vertical axis — spreads across composition height', () => {
    // Composition 500 tall. Three 50×50 layers stacked near the top.
    const scene = mkScene([
      mkShape('a', 0, 50,  50, 50),  // centerY 75
      mkShape('b', 0, 100, 50, 50),  // centerY 125
      mkShape('c', 0, 150, 50, 50),  // centerY 175
    ])
    //  a: targetY = 25  (top edge 0)        → dy = -50
    //  c: targetY = 475 (bottom edge 500)   → dy = 300
    //  b: targetY = (25 + 475)/2 = 250      → dy = 125
    const result = computeSpreadAcrossCanvas({
      layerIds: ['a', 'b', 'c'],
      axis: 'vertical',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([
      { layerId: 'a', dx: 0, dy: -50  },
      { layerId: 'b', dx: 0, dy: 125  },
      { layerId: 'c', dx: 0, dy: 300  },
    ])
  })

  it('does nothing for < 2 layers', () => {
    const scene = mkScene([mkShape('a', 0, 0)])
    const result = computeSpreadAcrossCanvas({
      layerIds: ['a'],
      axis: 'horizontal',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([])
  })
})

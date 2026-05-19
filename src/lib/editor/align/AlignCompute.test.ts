import { describe, expect, it } from 'vitest'
import type { ChronoScene, Composition, Layer } from '../../types'
import { computeAlignTransforms } from './AlignCompute'

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

describe('computeAlignTransforms — Align to Selection', () => {
  it('aligns three rects to the left edge of the union bounds', () => {
    const scene = mkScene([
      mkShape('a', 10, 10),
      mkShape('b', 50, 60),
      mkShape('c', 200, 80),
    ])
    const result = computeAlignTransforms({
      layerIds: ['a', 'b', 'c'],
      operation: 'left',
      alignTo: 'selection',
      composition,
      scene,
    })
    // a is already at x=10 (= minX) → no move
    // b moves from 50 → 10 (dx = -40)
    // c moves from 200 → 10 (dx = -190)
    expect(result.transforms).toEqual([
      { layerId: 'b', dx: -40, dy: 0 },
      { layerId: 'c', dx: -190, dy: 0 },
    ])
  })

  it('aligns to the right edge of the union bounds', () => {
    const scene = mkScene([
      mkShape('a', 10, 10, 80, 40),    // right edge at 90
      mkShape('b', 50, 60, 100, 50),   // right edge at 150
      mkShape('c', 200, 80, 60, 30),   // right edge at 260 (max)
    ])
    const result = computeAlignTransforms({
      layerIds: ['a', 'b', 'c'],
      operation: 'right',
      alignTo: 'selection',
      composition,
      scene,
    })
    // target right = 260
    // a: 90 → 260, dx = 170
    // b: 150 → 260, dx = 110
    // c: already at 260, skip
    expect(result.transforms).toEqual([
      { layerId: 'a', dx: 170, dy: 0 },
      { layerId: 'b', dx: 110, dy: 0 },
    ])
  })

  it('aligns vertically by horizontal centers (centerX)', () => {
    const scene = mkScene([
      mkShape('a', 0,   0, 100, 50),   // centerX 50, minX 0,  maxX 100
      mkShape('b', 200, 0, 100, 50),   // centerX 250, minX 200, maxX 300
    ])
    const result = computeAlignTransforms({
      layerIds: ['a', 'b'],
      operation: 'centerX',
      alignTo: 'selection',
      composition,
      scene,
    })
    // selection bounds: minX=0, maxX=300 → centerX = 150
    // a: center 50 → 150, dx = 100
    // b: center 250 → 150, dx = -100
    expect(result.transforms).toEqual([
      { layerId: 'a', dx: 100, dy: 0 },
      { layerId: 'b', dx: -100, dy: 0 },
    ])
  })
})

describe('computeAlignTransforms — Align to Canvas', () => {
  it('aligns to the canvas left edge (x = 0)', () => {
    const scene = mkScene([mkShape('a', 50, 50, 100, 40)])
    const result = computeAlignTransforms({
      layerIds: ['a'],
      operation: 'left',
      alignTo: 'canvas',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([{ layerId: 'a', dx: -50, dy: 0 }])
  })

  it('centers a layer horizontally in a 1000×500 canvas', () => {
    const scene = mkScene([mkShape('a', 50, 50, 100, 40)])
    const result = computeAlignTransforms({
      layerIds: ['a'],
      operation: 'centerX',
      alignTo: 'canvas',
      composition,
      scene,
    })
    // canvas centerX = 500, layer centerX = 100 → dx = 400
    expect(result.transforms).toEqual([{ layerId: 'a', dx: 400, dy: 0 }])
  })

  it('aligns to the canvas bottom edge', () => {
    const scene = mkScene([mkShape('a', 0, 100, 80, 60)])
    const result = computeAlignTransforms({
      layerIds: ['a'],
      operation: 'bottom',
      alignTo: 'canvas',
      composition,
      scene,
    })
    // layer bottom = 160, canvas bottom = 500 → dy = 340
    expect(result.transforms).toEqual([{ layerId: 'a', dx: 0, dy: 340 }])
  })
})

describe('computeAlignTransforms — edge cases', () => {
  it('skips group layers (no bounds)', () => {
    const group: Layer = {
      id: 'g',
      name: 'group',
      type: 'group',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
      opacity: 1,
    }
    const scene = mkScene([group, mkShape('a', 100, 0)])
    const result = computeAlignTransforms({
      layerIds: ['g', 'a'],
      operation: 'left',
      alignTo: 'selection',
      composition,
      scene,
    })
    // Only 'a' is alignable. Selection bounds = a's bounds → a already there.
    expect(result.transforms).toEqual([])
  })

  it('returns empty when no alignable layers exist', () => {
    const scene = mkScene([])
    const result = computeAlignTransforms({
      layerIds: ['missing'],
      operation: 'left',
      alignTo: 'selection',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([])
  })

  it('walks parent chain for children of groups', () => {
    const parent: Layer = {
      id: 'p',
      name: 'parent',
      type: 'group',
      transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
      opacity: 1,
    }
    const child = mkShape('child', 0, 0, 50, 50)
    child.parentId = 'p'
    const scene = mkScene([parent, child])
    // Child world bounds: (100,100) → (150,150). Align to canvas left → dx = -100.
    const result = computeAlignTransforms({
      layerIds: ['child'],
      operation: 'left',
      alignTo: 'canvas',
      composition,
      scene,
    })
    expect(result.transforms).toEqual([{ layerId: 'child', dx: -100, dy: 0 }])
  })
})

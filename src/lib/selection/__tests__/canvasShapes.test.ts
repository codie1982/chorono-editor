import { describe, it, expect } from 'vitest'
import {
  pointInRect, pointInCircle, pointInPolygon,
  layersInRect, layersInCircle, layersInPolygon, layersUnderPaintBrush,
  layerAnchorWorldPos,
} from '../canvasShapes'
import type { ChronoScene, Layer } from '../../types'

function makeLayer(p: {
  id: string; x?: number; y?: number; anchorX?: number; anchorY?: number
  hidden?: boolean; locked?: boolean; type?: string; parentId?: string
}): Layer {
  return {
    id: p.id, name: p.id, type: (p.type ?? 'shape') as Layer['type'],
    transform: {
      x: p.x ?? 0, y: p.y ?? 0,
      scaleX: 1, scaleY: 1, rotationDeg: 0,
      anchorX: p.anchorX ?? 0, anchorY: p.anchorY ?? 0,
    },
    opacity: 1,
    hidden: p.hidden ?? false,
    locked: p.locked ?? false,
    parentId: p.parentId,
  } as unknown as Layer
}

function makeScene(layers: Layer[]): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: { id: 'c', width: 1000, height: 1000, durationMs: 1000, frameRate: 30, backgroundColor: '#000' },
    assets: [], layers,
    timelines: [], parameters: [], triggers: [], bindings: [],
    initialState: {},
  } as unknown as ChronoScene
}

describe('pointInRect', () => {
  const rect = { x: 10, y: 10, w: 100, h: 50 }

  it('inside is true', () => {
    expect(pointInRect({ x: 50, y: 30 }, rect)).toBe(true)
  })

  it('edges count as inside', () => {
    expect(pointInRect({ x: 10,  y: 10 }, rect)).toBe(true)
    expect(pointInRect({ x: 110, y: 60 }, rect)).toBe(true)
  })

  it('outside is false', () => {
    expect(pointInRect({ x: 5,   y: 30 }, rect)).toBe(false)
    expect(pointInRect({ x: 200, y: 30 }, rect)).toBe(false)
  })
})

describe('pointInCircle', () => {
  const c = { x: 100, y: 100, r: 50 }

  it('center is inside', () => {
    expect(pointInCircle({ x: 100, y: 100 }, c)).toBe(true)
  })

  it('edge counts as inside', () => {
    expect(pointInCircle({ x: 150, y: 100 }, c)).toBe(true)
  })

  it('outside is false', () => {
    expect(pointInCircle({ x: 200, y: 100 }, c)).toBe(false)
  })
})

describe('pointInPolygon', () => {
  // Triangle (0,0) → (10,0) → (5,10)
  const triangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }]

  it('inside is true', () => {
    expect(pointInPolygon({ x: 5, y: 3 }, triangle)).toBe(true)
  })

  it('outside is false', () => {
    expect(pointInPolygon({ x: 20, y: 5 }, triangle)).toBe(false)
    expect(pointInPolygon({ x: 5, y: 20 }, triangle)).toBe(false)
  })

  it('returns false for degenerate polygons (< 3 vertices)', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false)
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false)
  })

  it('handles concave polygons (L-shape)', () => {
    // L-shape: an outer square with a square notch cut out
    const L = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 },
      { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 },
    ]
    expect(pointInPolygon({ x: 2, y: 2 }, L)).toBe(true)   // in bottom-left arm
    expect(pointInPolygon({ x: 8, y: 8 }, L)).toBe(false)  // in the notch
  })
})

describe('layerAnchorWorldPos', () => {
  it('uses transform.x + anchorX directly for root layers', () => {
    const l = makeLayer({ id: 'a', x: 50, y: 60, anchorX: 5, anchorY: 10 })
    const scene = makeScene([l])
    expect(layerAnchorWorldPos(scene, l)).toEqual({ x: 55, y: 70 })
  })

  it('walks parent chain for nested layers', () => {
    const parent = makeLayer({ id: 'g', x: 100, y: 200 })
    const child  = makeLayer({ id: 'c', x: 10,  y: 20, parentId: 'g' })
    const scene  = makeScene([parent, child])
    expect(layerAnchorWorldPos(scene, child)).toEqual({ x: 110, y: 220 })
  })
})

describe('layersInRect — bulk hit', () => {
  const scene = makeScene([
    makeLayer({ id: 'inside1',  x: 50,  y: 50 }),
    makeLayer({ id: 'inside2',  x: 80,  y: 80 }),
    makeLayer({ id: 'outside',  x: 500, y: 500 }),
    makeLayer({ id: 'hidden',   x: 50,  y: 50, hidden: true }),
    makeLayer({ id: 'locked',   x: 50,  y: 50, locked: true }),
    makeLayer({ id: 'audio',    x: 50,  y: 50, type: 'audio' }),
  ])

  it('selects only visible + unlocked + non-audio layers inside the rect', () => {
    const hits = layersInRect(scene, { x: 0, y: 0, w: 100, h: 100 })
    expect(hits.has('inside1')).toBe(true)
    expect(hits.has('inside2')).toBe(true)
    expect(hits.has('outside')).toBe(false)
    expect(hits.has('hidden')).toBe(false)
    expect(hits.has('locked')).toBe(false)
    expect(hits.has('audio')).toBe(false)
    expect(hits.size).toBe(2)
  })
})

describe('layersInCircle', () => {
  const scene = makeScene([
    makeLayer({ id: 'in',  x: 100, y: 100 }),
    makeLayer({ id: 'near',x: 130, y: 100 }),    // 30px away
    makeLayer({ id: 'far', x: 300, y: 300 }),
  ])

  it('matches layers within radius', () => {
    const hits = layersInCircle(scene, { x: 100, y: 100, r: 50 })
    expect(hits.has('in')).toBe(true)
    expect(hits.has('near')).toBe(true)
    expect(hits.has('far')).toBe(false)
  })
})

describe('layersInPolygon', () => {
  const scene = makeScene([
    makeLayer({ id: 'in',  x: 5, y: 3 }),
    makeLayer({ id: 'out', x: 20, y: 5 }),
  ])
  // Triangle (0,0) → (10,0) → (5,10)
  const triangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }]

  it('selects layers inside the polygon', () => {
    const hits = layersInPolygon(scene, triangle)
    expect(hits.has('in')).toBe(true)
    expect(hits.has('out')).toBe(false)
  })
})

describe('layersUnderPaintBrush', () => {
  const scene = makeScene([
    makeLayer({ id: 'under', x: 100, y: 100 }),
    makeLayer({ id: 'far',   x: 500, y: 500 }),
  ])

  it('alias of layersInCircle for paint-style continuous selection', () => {
    const hits = layersUnderPaintBrush(scene, { x: 110, y: 105 }, 20)
    expect(hits.has('under')).toBe(true)
    expect(hits.has('far')).toBe(false)
  })
})

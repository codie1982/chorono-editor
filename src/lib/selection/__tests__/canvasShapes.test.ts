import { describe, it, expect } from 'vitest'
import {
  pointInRect, pointInCircle, pointInPolygon,
  rectInsideRect, rectIntersectsRect,
  rectInsideCircle, rectIntersectsCircle,
  rectInsidePolygon, rectIntersectsPolygon,
  segmentsIntersect,
  layersInRect, layersInCircle, layersInPolygon, layersUnderPaintBrush,
  layerAnchorWorldPos, getLayerWorldBounds,
} from '../canvasShapes'
import type { ChronoScene, Layer } from '../../types'

function makeLayer(p: {
  id: string; x?: number; y?: number; w?: number; h?: number
  anchorX?: number; anchorY?: number
  hidden?: boolean; locked?: boolean; type?: string; parentId?: string
}): Layer {
  return {
    id: p.id, name: p.id, type: (p.type ?? 'shape') as Layer['type'],
    transform: {
      x: p.x ?? 0, y: p.y ?? 0,
      scaleX: 1, scaleY: 1, rotationDeg: 0,
      anchorX: p.anchorX ?? 0, anchorY: p.anchorY ?? 0,
    },
    size: (p.w != null || p.h != null) ? { width: p.w ?? 1, height: p.h ?? 1 } : undefined,
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

describe('point-in-shape primitives', () => {
  it('pointInRect — inside / edge / outside', () => {
    const r = { x: 10, y: 10, w: 100, h: 50 }
    expect(pointInRect({ x: 50,  y: 30 }, r)).toBe(true)
    expect(pointInRect({ x: 10,  y: 10 }, r)).toBe(true)   // edge
    expect(pointInRect({ x: 5,   y: 30 }, r)).toBe(false)
  })

  it('pointInCircle', () => {
    const c = { x: 100, y: 100, r: 50 }
    expect(pointInCircle({ x: 100, y: 100 }, c)).toBe(true)
    expect(pointInCircle({ x: 150, y: 100 }, c)).toBe(true) // edge
    expect(pointInCircle({ x: 200, y: 100 }, c)).toBe(false)
  })

  it('pointInPolygon — triangle, concave L', () => {
    const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 10 }]
    expect(pointInPolygon({ x: 5, y: 3 },  tri)).toBe(true)
    expect(pointInPolygon({ x: 20, y: 5 }, tri)).toBe(false)
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false)

    const L = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 },
      { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 },
    ]
    expect(pointInPolygon({ x: 2, y: 2 }, L)).toBe(true)
    expect(pointInPolygon({ x: 8, y: 8 }, L)).toBe(false)   // in the notch
  })
})

describe('AABB-shape relations (BL-60 Faz 3 inside/touching)', () => {
  const outer = { x: 0, y: 0, w: 100, h: 100 }

  it('rectInsideRect — fully enclosed (incl. shared edges)', () => {
    expect(rectInsideRect({ x: 10, y: 10, w: 50, h: 50 }, outer)).toBe(true)
    expect(rectInsideRect({ x: 0,  y: 0,  w: 100, h: 100 }, outer)).toBe(true) // exact
    expect(rectInsideRect({ x: 50, y: 50, w: 100, h: 50 }, outer)).toBe(false) // crosses right edge
  })

  it('rectIntersectsRect — overlap, touching counts', () => {
    expect(rectIntersectsRect({ x: 50,  y: 50,  w: 100, h: 50  }, outer)).toBe(true)
    expect(rectIntersectsRect({ x: 100, y: 50,  w: 50,  h: 50  }, outer)).toBe(true)  // touching edge
    expect(rectIntersectsRect({ x: 200, y: 50,  w: 50,  h: 50  }, outer)).toBe(false)
  })

  it('rectInsideCircle — all 4 corners inside', () => {
    const c = { x: 100, y: 100, r: 50 }
    expect(rectInsideCircle({ x: 90, y: 90, w: 20, h: 20 }, c)).toBe(true)
    expect(rectInsideCircle({ x: 60, y: 60, w: 80, h: 80 }, c)).toBe(false) // corners outside
  })

  it('rectIntersectsCircle — closest point ≤ radius', () => {
    const c = { x: 100, y: 100, r: 50 }
    // Rect with corner inside circle: (130,130,20,20) → closest point (130,130) is sqrt(900+900)≈42 < 50
    expect(rectIntersectsCircle({ x: 130, y: 130, w: 20, h: 20 }, c)).toBe(true)
    // Rect contains circle entirely
    expect(rectIntersectsCircle({ x: 0,   y: 0,   w: 200, h: 200 }, c)).toBe(true)
    // Rect adjacent edge touches circle radius
    expect(rectIntersectsCircle({ x: 150, y: 80,  w: 50,  h: 50 }, c)).toBe(true)
    expect(rectIntersectsCircle({ x: 200, y: 200, w: 20,  h: 20 }, c)).toBe(false)
  })

  it('rectInsidePolygon — all 4 corners inside polygon', () => {
    const tri = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }]
    expect(rectInsidePolygon({ x: 40, y: 10, w: 10, h: 10 }, tri)).toBe(true)
    expect(rectInsidePolygon({ x: 0,  y: 50, w: 100, h: 50 }, tri)).toBe(false)
  })

  it('rectIntersectsPolygon — corner-in or edge-crosses', () => {
    const tri = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }]
    // Rect inside triangle → corners-in
    expect(rectIntersectsPolygon({ x: 40, y: 10, w: 10, h: 10 }, tri)).toBe(true)
    // Rect straddling triangle edge (40,40,20,20) — top-left inside, others may not be
    expect(rectIntersectsPolygon({ x: 40, y: 40, w: 20, h: 20 }, tri)).toBe(true)
    // Rect containing the triangle entirely
    expect(rectIntersectsPolygon({ x: -10, y: -10, w: 200, h: 200 }, tri)).toBe(true)
    // Far-away rect
    expect(rectIntersectsPolygon({ x: 200, y: 200, w: 10, h: 10 }, tri)).toBe(false)
  })

  it('segmentsIntersect — basic + collinear', () => {
    expect(segmentsIntersect(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 0, y: 10 }, { x: 10, y: 0 },
    )).toBe(true)
    expect(segmentsIntersect(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 1 }, { x: 10, y: 1 },
    )).toBe(false)
  })
})

describe('getLayerWorldBounds + layerAnchorWorldPos', () => {
  it('layerAnchorWorldPos uses transform + anchor, walks parents', () => {
    const parent = makeLayer({ id: 'g', x: 100, y: 200 })
    const child  = makeLayer({ id: 'c', x: 10,  y: 20, anchorX: 5, parentId: 'g' })
    const scene  = makeScene([parent, child])
    expect(layerAnchorWorldPos(scene, child)).toEqual({ x: 115, y: 220 })
  })

  it('getLayerWorldBounds uses size, walks parents (no anchor offset)', () => {
    const parent = makeLayer({ id: 'g', x: 100, y: 200 })
    const child  = makeLayer({ id: 'c', x: 10,  y: 20, w: 30, h: 40, parentId: 'g' })
    const scene  = makeScene([parent, child])
    const b = getLayerWorldBounds(scene, child)
    expect(b).toEqual({ x: 110, y: 220, w: 30, h: 40 })
  })

  it('getLayerWorldBounds defaults to 1×1 when layer has no size', () => {
    const layer = makeLayer({ id: 'l', x: 50, y: 60 })
    const scene = makeScene([layer])
    expect(getLayerWorldBounds(scene, layer)).toEqual({ x: 50, y: 60, w: 1, h: 1 })
  })
})

describe('layersInRect — inside vs touching mode', () => {
  // Three layers, all positioned at top-left of their bounds.
  const scene = makeScene([
    makeLayer({ id: 'inside',    x: 10, y: 10, w: 30, h: 30 }),   // bounds (10,10,30,30) — fully inside
    makeLayer({ id: 'straddles', x: 80, y: 80, w: 50, h: 50 }),   // bounds (80,80,50,50) — crosses right/bottom
    makeLayer({ id: 'outside',   x: 500, y: 500, w: 10, h: 10 }), // far away
  ])
  const rect = { x: 0, y: 0, w: 100, h: 100 }

  it('inside mode: only fully-enclosed layers', () => {
    const hits = layersInRect(scene, rect, 'inside')
    expect(hits.has('inside')).toBe(true)
    expect(hits.has('straddles')).toBe(false)
    expect(hits.has('outside')).toBe(false)
  })

  it('touching mode: any overlap counts (default)', () => {
    const hits = layersInRect(scene, rect)  // default = 'touching'
    expect(hits.has('inside')).toBe(true)
    expect(hits.has('straddles')).toBe(true)
    expect(hits.has('outside')).toBe(false)
  })

  it('hidden / locked / audio layers always excluded regardless of mode', () => {
    const sceneFiltered = makeScene([
      makeLayer({ id: 'inside', x: 10, y: 10, w: 30, h: 30 }),
      makeLayer({ id: 'hidden', x: 10, y: 10, w: 30, h: 30, hidden: true }),
      makeLayer({ id: 'locked', x: 10, y: 10, w: 30, h: 30, locked: true }),
      makeLayer({ id: 'audio',  x: 10, y: 10, w: 30, h: 30, type: 'audio' }),
    ])
    const inHits = layersInRect(sceneFiltered, rect, 'inside')
    const toHits = layersInRect(sceneFiltered, rect, 'touching')
    expect(inHits.has('inside')).toBe(true)
    expect(toHits.has('inside')).toBe(true)
    for (const id of ['hidden', 'locked', 'audio']) {
      expect(inHits.has(id)).toBe(false)
      expect(toHits.has(id)).toBe(false)
    }
  })
})

describe('layersInCircle — inside vs touching mode', () => {
  const scene = makeScene([
    makeLayer({ id: 'tiny-inside', x: 95, y: 95, w: 10, h: 10 }),
    makeLayer({ id: 'partial',     x: 145, y: 90, w: 20, h: 20 }),  // straddles edge
    makeLayer({ id: 'far',         x: 500, y: 500, w: 10, h: 10 }),
  ])
  const circle = { x: 100, y: 100, r: 50 }

  it('inside: all corners inside circle', () => {
    const hits = layersInCircle(scene, circle, 'inside')
    expect(hits.has('tiny-inside')).toBe(true)
    expect(hits.has('partial')).toBe(false)
    expect(hits.has('far')).toBe(false)
  })

  it('touching: any overlap', () => {
    const hits = layersInCircle(scene, circle, 'touching')
    expect(hits.has('tiny-inside')).toBe(true)
    expect(hits.has('partial')).toBe(true)
    expect(hits.has('far')).toBe(false)
  })
})

describe('layersInPolygon — inside vs touching mode', () => {
  // Triangle (0,0)→(100,0)→(50,100). At y=60 it spans x=30..70.
  const tri = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }]
  const scene = makeScene([
    makeLayer({ id: 'inside-tri', x: 40, y: 10, w: 10, h: 10 }),    // fully inside triangle
    // Bounds (30,20)→(90,60). Right edge crosses triangle's right side.
    makeLayer({ id: 'straddles',  x: 30, y: 20, w: 60, h: 40 }),
    makeLayer({ id: 'far',        x: 500, y: 500, w: 10, h: 10 }),
  ])

  it('inside: all 4 corners inside polygon', () => {
    const hits = layersInPolygon(scene, tri, 'inside')
    expect(hits.has('inside-tri')).toBe(true)
    expect(hits.has('straddles')).toBe(false)
  })

  it('touching: bounds overlap polygon', () => {
    const hits = layersInPolygon(scene, tri, 'touching')
    expect(hits.has('inside-tri')).toBe(true)
    expect(hits.has('straddles')).toBe(true)
    expect(hits.has('far')).toBe(false)
  })
})

describe('layersUnderPaintBrush — always touching semantics', () => {
  it('matches layers whose bounds intersect the brush circle', () => {
    const scene = makeScene([
      makeLayer({ id: 'under', x: 100, y: 100, w: 10, h: 10 }),
      makeLayer({ id: 'far',   x: 500, y: 500, w: 10, h: 10 }),
    ])
    const hits = layersUnderPaintBrush(scene, { x: 110, y: 105 }, 20)
    expect(hits.has('under')).toBe(true)
    expect(hits.has('far')).toBe(false)
  })
})

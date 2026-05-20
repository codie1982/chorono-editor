import { describe, it, expect } from 'vitest'
import {
  NODE_W, NODE_H, autoLayoutPos, statePos, borderPoint,
  edgeMidpoint, hitNode, canvasBounds, type NodePos,
} from './graphLayout'

describe('autoLayoutPos / statePos', () => {
  it('lays states out on a 3-column grid', () => {
    expect(autoLayoutPos(0)).toEqual({ x: 110, y: 80 })
    expect(autoLayoutPos(2).x).toBeGreaterThan(autoLayoutPos(0).x) // same row
    expect(autoLayoutPos(3).y).toBeGreaterThan(autoLayoutPos(0).y) // wrapped row
  })

  it('prefers stored position over auto-layout', () => {
    expect(statePos({ x: 5, y: 9 }, 0)).toEqual({ x: 5, y: 9 })
    expect(statePos({}, 1)).toEqual(autoLayoutPos(1))
  })
})

describe('borderPoint', () => {
  const c: NodePos = { x: 100, y: 100 }
  it('exits the right edge toward a point to the right', () => {
    const p = borderPoint(c, { x: 400, y: 100 })
    expect(p.x).toBeCloseTo(100 + NODE_W / 2)
    expect(p.y).toBeCloseTo(100)
  })
  it('exits the top edge toward a point straight above', () => {
    const p = borderPoint(c, { x: 100, y: -100 })
    expect(p.y).toBeCloseTo(100 - NODE_H / 2)
  })
  it('returns the centre for a coincident target', () => {
    expect(borderPoint(c, c)).toEqual(c)
  })
})

describe('edgeMidpoint', () => {
  it('sits between two horizontally separated nodes', () => {
    const m = edgeMidpoint({ x: 0, y: 0 }, { x: 400, y: 0 })
    expect(m.x).toBeGreaterThan(0)
    expect(m.x).toBeLessThan(400)
    expect(m.y).toBeCloseTo(0)
  })
})

describe('hitNode', () => {
  const pos: NodePos = { x: 100, y: 100 }
  it('detects points inside the node box', () => {
    expect(hitNode(pos, 100, 100)).toBe(true)
    expect(hitNode(pos, 100 + NODE_W / 2 - 1, 100)).toBe(true)
  })
  it('rejects points outside', () => {
    expect(hitNode(pos, 100 + NODE_W, 100)).toBe(false)
    expect(hitNode(pos, 100, 100 + NODE_H)).toBe(false)
  })
})

describe('canvasBounds', () => {
  it('grows to contain the furthest node', () => {
    const b = canvasBounds([{ x: 1000, y: 800 }])
    expect(b.width).toBeGreaterThan(1000)
    expect(b.height).toBeGreaterThan(800)
  })
  it('has a sensible minimum for an empty graph', () => {
    const b = canvasBounds([])
    expect(b.width).toBeGreaterThanOrEqual(400)
    expect(b.height).toBeGreaterThanOrEqual(300)
  })
})

import { describe, it, expect } from 'vitest'
import { Bounds } from './Bounds'

describe('Bounds', () => {
  it('empty bounds reads as empty', () => {
    const b = Bounds.empty()
    expect(b.isEmpty()).toBe(true)
  })

  it('fromMinMax normalises swapped args', () => {
    const b = Bounds.fromMinMax(10, 20, 0, 5)
    expect(b.x).toBe(0)
    expect(b.y).toBe(5)
    expect(b.width).toBe(10)
    expect(b.height).toBe(15)
  })

  it('fromPoints handles single point', () => {
    const b = Bounds.fromPoints([{ x: 5, y: 7 }])
    expect(b.x).toBe(5)
    expect(b.y).toBe(7)
    expect(b.width).toBe(0)
    expect(b.height).toBe(0)
  })

  it('fromPoints handles many points', () => {
    const b = Bounds.fromPoints([
      { x: 0, y: 0 }, { x: 10, y: 5 }, { x: -3, y: 8 },
    ])
    expect(b.x).toBe(-3)
    expect(b.y).toBe(0)
    expect(b.maxX).toBe(10)
    expect(b.maxY).toBe(8)
  })

  it('containsPoint inside / outside', () => {
    const b = new Bounds(0, 0, 10, 10)
    expect(b.containsPoint({ x: 5, y: 5 })).toBe(true)
    expect(b.containsPoint({ x: 11, y: 5 })).toBe(false)
  })

  it('union of two bounds', () => {
    const a = new Bounds(0, 0, 5, 5)
    const c = new Bounds(3, 3, 5, 5)
    const u = a.union(c)
    expect(u.x).toBe(0); expect(u.y).toBe(0)
    expect(u.maxX).toBe(8); expect(u.maxY).toBe(8)
  })

  it('intersects', () => {
    const a = new Bounds(0, 0, 5, 5)
    const b = new Bounds(3, 3, 5, 5)
    const c = new Bounds(10, 10, 2, 2)
    expect(a.intersects(b)).toBe(true)
    expect(a.intersects(c)).toBe(false)
  })

  it('inflate grows on all sides', () => {
    const a = new Bounds(5, 5, 10, 10).inflate(2)
    expect(a.x).toBe(3); expect(a.y).toBe(3)
    expect(a.width).toBe(14); expect(a.height).toBe(14)
  })

  it('union with empty returns the non-empty', () => {
    const a = Bounds.empty()
    const b = new Bounds(1, 1, 2, 2)
    expect(a.union(b).toArray()).toEqual([1, 1, 2, 2])
    expect(b.union(a).toArray()).toEqual([1, 1, 2, 2])
  })
})

// Tiny helper used above so the assertion above remains terse
declare module './Bounds' {
  interface Bounds {
    toArray(): number[]
  }
}
;(Bounds.prototype as any).toArray = function (this: Bounds): number[] {
  return [this.x, this.y, this.width, this.height]
}

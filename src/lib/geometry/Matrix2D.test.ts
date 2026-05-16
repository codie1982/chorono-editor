import { describe, it, expect } from 'vitest'
import { Matrix2D } from './Matrix2D'

const EPS = 1e-9
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(EPS)

describe('Matrix2D', () => {
  describe('factories', () => {
    it('identity is identity', () => {
      const m = Matrix2D.identity()
      expect(m.isIdentity()).toBe(true)
      expect(m.toArray()).toEqual([1, 0, 0, 1, 0, 0])
    })

    it('translation produces correct offsets', () => {
      const m = Matrix2D.translation(10, 20)
      expect(m.toArray()).toEqual([1, 0, 0, 1, 10, 20])
    })

    it('scale produces correct diagonal', () => {
      const m = Matrix2D.scale(2, 3)
      expect(m.toArray()).toEqual([2, 0, 0, 3, 0, 0])
    })

    it('scale(s) is uniform when one arg given', () => {
      const m = Matrix2D.scale(2)
      expect(m.toArray()).toEqual([2, 0, 0, 2, 0, 0])
    })

    it('rotation(90) sends (1,0) to (0,1)', () => {
      const m = Matrix2D.rotation(90)
      const p = m.applyToPoint({ x: 1, y: 0 })
      close(p.x, 0)
      close(p.y, 1)
    })
  })

  describe('applyToPoint', () => {
    it('translates a point', () => {
      const m = Matrix2D.translation(10, 5)
      const p = m.applyToPoint({ x: 1, y: 2 })
      expect(p).toEqual({ x: 11, y: 7 })
    })

    it('scales then translates correctly', () => {
      const m = Matrix2D.translation(10, 0).scale(2)   // translate(10,0) × scale(2)
      const p = m.applyToPoint({ x: 1, y: 1 })
      // scale first → (2, 2); then translate(10, 0) → (12, 2)
      close(p.x, 12)
      close(p.y, 2)
    })

    it('rotation around origin', () => {
      const m = Matrix2D.rotation(180)
      const p = m.applyToPoint({ x: 1, y: 0 })
      close(p.x, -1)
      close(p.y, 0)
    })
  })

  describe('multiply', () => {
    it('identity × M = M', () => {
      const m = Matrix2D.translation(3, 4)
      const r = Matrix2D.identity().multiply(m)
      expect(r.toArray()).toEqual(m.toArray())
    })

    it('M × identity = M', () => {
      const m = Matrix2D.translation(3, 4)
      const r = m.multiply(Matrix2D.identity())
      expect(r.toArray()).toEqual(m.toArray())
    })

    it('composition order: rotate(90) then translate(10,0) puts (1,0) at (10,1)', () => {
      // We want: first rotate(90), then translate(10,0)
      // Post-multiplication: outer first. To express "first rotate, then translate":
      //   translate(10,0) × rotate(90) — translate is the outer (applied last)
      const m = Matrix2D.translation(10, 0).multiply(Matrix2D.rotation(90))
      const p = m.applyToPoint({ x: 1, y: 0 })
      close(p.x, 10)
      close(p.y, 1)
    })
  })

  describe('invert', () => {
    it('translation inverse undoes translation', () => {
      const m = Matrix2D.translation(7, -3)
      const inv = m.invert()
      const p = m.applyToPoint({ x: 1, y: 1 })
      const back = inv.applyToPoint(p)
      close(back.x, 1)
      close(back.y, 1)
    })

    it('rotation inverse undoes rotation', () => {
      const m = Matrix2D.rotation(45)
      const inv = m.invert()
      const back = inv.applyToPoint(m.applyToPoint({ x: 2, y: 3 }))
      close(back.x, 2)
      close(back.y, 3)
    })

    it('throws on singular matrix', () => {
      const m = Matrix2D.scale(0, 0)
      expect(() => m.invert()).toThrow(/singular/)
    })
  })

  describe('chainable shortcuts', () => {
    it('translate().rotate().scale() composes as expected', () => {
      const m = Matrix2D.identity().translate(10, 0).rotate(90).scale(2)
      // (1,0) → scale(2) → (2,0) → rotate(90) → (0,2) → translate(10,0) → (10,2)
      const p = m.applyToPoint({ x: 1, y: 0 })
      close(p.x, 10)
      close(p.y, 2)
    })
  })

  describe('inspection', () => {
    it('determinant of pure rotation is 1', () => {
      close(Matrix2D.rotation(37).determinant(), 1)
    })

    it('determinant of scale(2,3) is 6', () => {
      close(Matrix2D.scale(2, 3).determinant(), 6)
    })

    it('isIdentity tolerates floating-point noise', () => {
      // rotate by 360° brings it back, but accumulated FP error is non-zero
      const m = Matrix2D.rotation(360)
      expect(m.isIdentity(1e-6)).toBe(true)
    })
  })
})

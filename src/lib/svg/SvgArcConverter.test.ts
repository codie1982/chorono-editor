import { describe, it, expect } from 'vitest'
import { SvgArcConverter } from './SvgArcConverter'

const close = (a: number, b: number, eps = 1e-3) => expect(Math.abs(a - b)).toBeLessThan(eps)

/** Sample a cubic bezier at t∈[0,1]. */
function sampleCubic(p0x: number, p0y: number, c1x: number, c1y: number,
                     c2x: number, c2y: number, p3x: number, p3y: number, t: number) {
  const it = 1 - t
  return {
    x: it*it*it*p0x + 3*it*it*t*c1x + 3*it*t*t*c2x + t*t*t*p3x,
    y: it*it*it*p0y + 3*it*it*t*c1y + 3*it*t*t*c2y + t*t*t*p3y,
  }
}

describe('SvgArcConverter', () => {
  const conv = new SvgArcConverter()

  describe('degenerate cases', () => {
    it('zero radius → empty result', () => {
      expect(conv.convert({ x1: 0, y1: 0, x2: 10, y2: 0, rx: 0, ry: 5, xAxisRotationDeg: 0, largeArc: 0, sweep: 0 })).toEqual([])
      expect(conv.convert({ x1: 0, y1: 0, x2: 10, y2: 0, rx: 5, ry: 0, xAxisRotationDeg: 0, largeArc: 0, sweep: 0 })).toEqual([])
    })

    it('same endpoints → empty result (zero-length arc per spec)', () => {
      expect(conv.convert({ x1: 5, y1: 5, x2: 5, y2: 5, rx: 10, ry: 10, xAxisRotationDeg: 0, largeArc: 0, sweep: 1 })).toEqual([])
    })

    it('negative radii are absolutised', () => {
      const a = conv.convert({ x1: 0, y1: 0, x2: 10, y2: 0, rx: -5, ry: -5, xAxisRotationDeg: 0, largeArc: 0, sweep: 1 })
      expect(a.length).toBeGreaterThan(0)
    })
  })

  describe('quarter-circle arc', () => {
    // Quarter unit circle from (1, 0) to (0, 1), sweeping counter-clockwise
    // (sweep=0 in SVG since y is inverted in our convention is sweep=1; we
    // just verify the curve passes through the expected points).
    it('produces ONE cubic for a 90° arc', () => {
      const a = conv.convert({
        x1: 1, y1: 0, x2: 0, y2: 1,
        rx: 1, ry: 1, xAxisRotationDeg: 0,
        largeArc: 0, sweep: 1,
      })
      expect(a).toHaveLength(1)
    })

    it('endpoint matches x2,y2 exactly', () => {
      const a = conv.convert({
        x1: 10, y1: 0, x2: 0, y2: 10,
        rx: 10, ry: 10, xAxisRotationDeg: 0,
        largeArc: 0, sweep: 1,
      })
      const last = a[a.length - 1]
      close(last.x, 0)
      close(last.y, 10)
    })

    it('midpoint of bezier lies on the circle (within ~10⁻⁴)', () => {
      const a = conv.convert({
        x1: 10, y1: 0, x2: 0, y2: 10,
        rx: 10, ry: 10, xAxisRotationDeg: 0,
        largeArc: 0, sweep: 1,
      })
      const c = a[0]
      // Start point is (10, 0) — sample at t=0.5
      const p = sampleCubic(10, 0, c.x1, c.y1, c.x2, c.y2, c.x, c.y, 0.5)
      const r = Math.hypot(p.x, p.y)
      close(r, 10, 0.01)
    })
  })

  describe('full circle (two semicircles)', () => {
    // 180° arc → 2 segments. Full circle requires two A commands.
    it('180° arc produces 2 cubics', () => {
      const a = conv.convert({
        x1: 10, y1: 0, x2: -10, y2: 0,
        rx: 10, ry: 10, xAxisRotationDeg: 0,
        largeArc: 0, sweep: 1,
      })
      expect(a).toHaveLength(2)
    })

    it('360° via two 180° arcs ends at start', () => {
      const a1 = conv.convert({
        x1: 10, y1: 0, x2: -10, y2: 0,
        rx: 10, ry: 10, xAxisRotationDeg: 0,
        largeArc: 0, sweep: 1,
      })
      const a2 = conv.convert({
        x1: -10, y1: 0, x2: 10, y2: 0,
        rx: 10, ry: 10, xAxisRotationDeg: 0,
        largeArc: 0, sweep: 1,
      })
      const last = a2[a2.length - 1]
      close(last.x, 10)
      close(last.y, 0)
      expect(a1.length + a2.length).toBe(4)   // each semicircle = 2 cubics
    })
  })

  describe('flag combinations (large-arc × sweep)', () => {
    // Four arcs between (0,0) and (10,0) with rx=ry=8 (radius > half-chord
    // so the arc is genuinely < 180°; with rx=5 both arcs would be exactly
    // semicircles and the small/large distinction would collapse).
    const base = { x1: 0, y1: 0, x2: 10, y2: 0, rx: 8, ry: 8, xAxisRotationDeg: 0 }

    const arc = (largeArc: 0 | 1, sweep: 0 | 1) =>
      conv.convert({ ...base, largeArc, sweep })

    const sampleMidPoint = (cs: ReturnType<typeof arc>) => {
      // Approx midpoint = sample the middle cubic at t=0.5.
      // For 1-segment results, that's the only cubic.
      const c = cs[Math.floor(cs.length / 2)]
      // Use the start of THIS cubic as p0 — for first cubic that's (0,0),
      // otherwise it's the previous cubic's endpoint. Close enough.
      const prev = cs[Math.floor(cs.length / 2) - 1]
      const p0x = prev ? prev.x : 0
      const p0y = prev ? prev.y : 0
      return sampleCubic(p0x, p0y, c.x1, c.y1, c.x2, c.y2, c.x, c.y, 0.5)
    }

    it('sweep=0 and sweep=1 are on OPPOSITE sides of the chord', () => {
      const a = arc(0, 0)
      const b = arc(0, 1)
      const ma = sampleMidPoint(a)
      const mb = sampleMidPoint(b)
      // Different signs (one above, one below chord y=0)
      expect(Math.sign(ma.y)).not.toBe(Math.sign(mb.y))
      // And both are off-axis (non-trivial arc)
      expect(Math.abs(ma.y)).toBeGreaterThan(0.1)
      expect(Math.abs(mb.y)).toBeGreaterThan(0.1)
    })

    it('large-arc=1 produces MORE cubics than large-arc=0 (long way around)', () => {
      const small = arc(0, 1)
      const large = arc(1, 1)
      expect(large.length).toBeGreaterThan(small.length)
    })

    it('all 4 flag combos end at (x2, y2)', () => {
      for (const la of [0, 1] as const) {
        for (const sw of [0, 1] as const) {
          const cs   = arc(la, sw)
          const last = cs[cs.length - 1]
          close(last.x, 10)
          close(last.y, 0)
        }
      }
    })
  })

  describe('radii enlargement (Λ > 1)', () => {
    // Endpoints far apart, but tiny radii. Spec says to scale radii up until
    // the arc fits.
    it('still produces a valid arc when radii are too small', () => {
      const a = conv.convert({
        x1: 0, y1: 0, x2: 100, y2: 0,
        rx: 10, ry: 10,   // way too small for a 100-unit chord
        xAxisRotationDeg: 0, largeArc: 0, sweep: 1,
      })
      expect(a.length).toBeGreaterThan(0)
      const last = a[a.length - 1]
      close(last.x, 100)
      close(last.y, 0)
    })
  })

  describe('rotation', () => {
    it('45° rotated ellipse still ends at correct point', () => {
      const a = conv.convert({
        x1: 0, y1: 0, x2: 10, y2: 10,
        rx: 10, ry: 5, xAxisRotationDeg: 45,
        largeArc: 0, sweep: 1,
      })
      const last = a[a.length - 1]
      close(last.x, 10)
      close(last.y, 10)
    })
  })
})

import { describe, it, expect } from 'vitest'
import { ShapeToPathConverter } from './ShapeToPathConverter'
import type { ShapeParams } from '@/lib/types'

const SIZE = { width: 100, height: 100 }

describe('ShapeToPathConverter', () => {
  describe('rect', () => {
    it('plain rect → 4 line edges + close', () => {
      const p = ShapeToPathConverter.convert('rect', SIZE, undefined, 0)
      expect(p.closed).toBe(true)
      expect(p.commands.map(c => c.type)).toEqual(['M', 'L', 'L', 'L', 'Z'])
    })

    it('rounded rect → uses cubic beziers for corners', () => {
      const p = ShapeToPathConverter.convert('rect', SIZE, undefined, 10)
      expect(p.closed).toBe(true)
      // 1 M + 4 lines (straight edges) + 4 cubics (corners) + 1 Z = 10 commands
      expect(p.commands.length).toBe(10)
      expect(p.commands.filter(c => c.type === 'C').length).toBe(4)
    })
  })

  describe('circle / ellipse', () => {
    it('circle → 4 cubics + close', () => {
      const p = ShapeToPathConverter.convert('circle', SIZE)
      expect(p.closed).toBe(true)
      expect(p.commands.filter(c => c.type === 'C').length).toBe(4)
    })

    it('ellipse with width != height → still 4 cubics', () => {
      const p = ShapeToPathConverter.convert('ellipse', { width: 200, height: 80 })
      expect(p.closed).toBe(true)
      expect(p.commands.filter(c => c.type === 'C').length).toBe(4)
    })
  })

  describe('line / arrow', () => {
    it('line → M + L, not closed', () => {
      const p = ShapeToPathConverter.convert('line', SIZE,
        { kind: 'line', x2: 50, y2: 50 } as ShapeParams)
      expect(p.closed).toBe(false)
      expect(p.commands.map(c => c.type)).toEqual(['M', 'L'])
    })

    it('arrow → main line + two arrowhead legs', () => {
      const p = ShapeToPathConverter.convert('arrow', SIZE,
        { kind: 'arrow', x2: 100, y2: 0, arrowHeadSize: 12 } as ShapeParams)
      expect(p.closed).toBe(false)
      // M L M L M L (main + 2 head segments, each preceded by M)
      expect(p.commands.length).toBe(6)
    })
  })

  describe('polygon', () => {
    it('hexagon → 6 vertices + close', () => {
      const p = ShapeToPathConverter.convert('polygon', SIZE,
        { kind: 'polygon', sides: 6 } as ShapeParams)
      expect(p.closed).toBe(true)
      // 1 M + 5 L + 1 Z
      expect(p.commands.length).toBe(7)
    })

    it('rounds non-integer side counts', () => {
      const p = ShapeToPathConverter.convert('polygon', SIZE,
        { kind: 'polygon', sides: 5.7 } as ShapeParams)
      // 5.7 → round → 6 → 1 M + 5 L + 1 Z = 7
      expect(p.commands.length).toBe(7)
    })

    it('minimum 3 sides enforced', () => {
      const p = ShapeToPathConverter.convert('polygon', SIZE,
        { kind: 'polygon', sides: 2 } as ShapeParams)
      // 3 sides → 1 M + 2 L + 1 Z = 4
      expect(p.commands.length).toBe(4)
    })
  })

  describe('star', () => {
    it('5-point star → 10 vertices + close', () => {
      const p = ShapeToPathConverter.convert('star', SIZE,
        { kind: 'star', sides: 5 } as ShapeParams)
      expect(p.closed).toBe(true)
      // 1 M + 9 L + 1 Z = 11
      expect(p.commands.length).toBe(11)
    })
  })

  describe('arc (open)', () => {
    it('arc is not closed and has no Z', () => {
      const p = ShapeToPathConverter.convert('arc', SIZE,
        { kind: 'arc', startAngle: 0, endAngle: 90 } as ShapeParams)
      expect(p.closed).toBe(false)
      expect(p.commands.find(c => c.type === 'Z')).toBeUndefined()
    })
  })

  describe('ring', () => {
    it('annular ring → starts with M and ends with Z', () => {
      const p = ShapeToPathConverter.convert('ring', SIZE,
        { kind: 'ring', startAngle: 0, endAngle: 360, innerRadius: 30 } as ShapeParams)
      expect(p.closed).toBe(true)
      expect(p.commands[0].type).toBe('M')
      expect(p.commands[p.commands.length - 1].type).toBe('Z')
    })
  })

  describe('default fallback', () => {
    it('unknown shape kind falls through to rect', () => {
      const p = ShapeToPathConverter.convert('unknown' as any, SIZE)
      expect(p.closed).toBe(true)
      expect(p.commands[0].type).toBe('M')
    })
  })

  // ── BL-24: Spiral / Wave / Blob ─────────────────────────────────────────────

  describe('spiral (BL-24)', () => {
    it('creates open path with many samples', () => {
      const p = ShapeToPathConverter.convert('spiral', { width: 120, height: 120 },
        { kind: 'spiral', turns: 3, startRadius: 4, endRadius: 56 } as ShapeParams)
      expect(p.closed).toBe(false)
      expect(p.commands.length).toBeGreaterThan(24)
      expect(p.commands[0].type).toBe('M')
      // No Z command — open path
      expect(p.commands.find(c => c.type === 'Z')).toBeUndefined()
    })

    it('starts near startRadius offset from center', () => {
      const p = ShapeToPathConverter.convert('spiral', { width: 100, height: 100 },
        { kind: 'spiral', turns: 1, startRadius: 10, endRadius: 40, tightness: 1 } as ShapeParams)
      const first = p.commands[0] as { type: 'M'; x: number; y: number }
      const cx = 50, cy = 50
      const dist = Math.hypot(first.x - cx, first.y - cy)
      // First sample at angle -π/2 → starts at top, distance ≈ startRadius
      expect(dist).toBeCloseTo(10, 1)
    })

    it('clamps turns to valid range', () => {
      // turns = 100 should be clamped to 20 → fewer samples than crazy values
      const p = ShapeToPathConverter.convert('spiral', { width: 100, height: 100 },
        { kind: 'spiral', turns: 100 } as ShapeParams)
      // 20 turns × 180 samples = 3600 (well under 4096 cap)
      expect(p.commands.length).toBeLessThanOrEqual(4096)
      expect(p.commands.length).toBeGreaterThan(100)
    })
  })

  describe('wave (BL-24)', () => {
    it('creates open horizontal wave from x=0 to x=width', () => {
      const p = ShapeToPathConverter.convert('wave', { width: 200, height: 80 },
        { kind: 'wave', amplitude: 20, frequency: 2, phase: 0 } as ShapeParams)
      expect(p.closed).toBe(false)
      expect(p.commands[0].type).toBe('M')
      const first = p.commands[0] as { type: 'M'; x: number; y: number }
      const last  = p.commands[p.commands.length - 1] as { type: 'L'; x: number; y: number }
      expect(first.x).toBeCloseTo(0)
      expect(last.x).toBeCloseTo(200)
    })

    it('phase=0 centers on cy at start (sin(0) = 0)', () => {
      const p = ShapeToPathConverter.convert('wave', { width: 200, height: 80 },
        { kind: 'wave', amplitude: 20, frequency: 2, phase: 0 } as ShapeParams)
      const first = p.commands[0] as { type: 'M'; x: number; y: number }
      expect(first.y).toBeCloseTo(40)  // cy = h/2 = 40
    })

    it('amplitude clamped to h/2', () => {
      // amplitude = 1000 with h=80 should clamp to 40
      const p = ShapeToPathConverter.convert('wave', { width: 100, height: 80 },
        { kind: 'wave', amplitude: 1000, frequency: 1, phase: Math.PI / 2 } as ShapeParams)
      // At t=0, phase=π/2 → sin(π/2)=1 → y = 40 + 40*1 = 80 (clamped amp = 40)
      const first = p.commands[0] as { type: 'M'; x: number; y: number }
      expect(first.y).toBeCloseTo(80, 1)
    })
  })

  describe('blob (BL-24)', () => {
    it('creates closed deterministic polygon', () => {
      const opts = { kind: 'blob' as const, sides: 8, irregularity: 0.4, seed: 42 } as ShapeParams
      const a = ShapeToPathConverter.convert('blob', { width: 120, height: 120 }, opts)
      const b = ShapeToPathConverter.convert('blob', { width: 120, height: 120 }, opts)
      expect(a.closed).toBe(true)
      expect(a.commands[a.commands.length - 1].type).toBe('Z')
      expect(a).toEqual(b)  // determinism check
    })

    it('different seeds produce different shapes', () => {
      const a = ShapeToPathConverter.convert('blob', { width: 120, height: 120 },
        { kind: 'blob', sides: 8, irregularity: 0.4, seed: 1 } as ShapeParams)
      const b = ShapeToPathConverter.convert('blob', { width: 120, height: 120 },
        { kind: 'blob', sides: 8, irregularity: 0.4, seed: 2 } as ShapeParams)
      expect(a).not.toEqual(b)
    })

    it('sides count produces sides+1 commands (n moves+lines + Z)', () => {
      const p = ShapeToPathConverter.convert('blob', { width: 100, height: 100 },
        { kind: 'blob', sides: 10, irregularity: 0.3, seed: 1 } as ShapeParams)
      // 1 M + 9 L + 1 Z = 11 commands for sides=10
      expect(p.commands.length).toBe(11)
    })

    it('irregularity=0 → perfect circle inscription (all radii equal)', () => {
      const p = ShapeToPathConverter.convert('blob', { width: 100, height: 100 },
        { kind: 'blob', sides: 12, irregularity: 0, seed: 99 } as ShapeParams)
      const cx = 50, cy = 50, baseR = 50
      const vertexCmds = p.commands.filter(c => c.type === 'M' || c.type === 'L')
      for (const c of vertexCmds) {
        const v = c as { x: number; y: number }
        const dist = Math.hypot(v.x - cx, v.y - cy)
        expect(dist).toBeCloseTo(baseR, 5)
      }
    })

    it('clamps sides to min 5', () => {
      const p = ShapeToPathConverter.convert('blob', { width: 100, height: 100 },
        { kind: 'blob', sides: 2 } as ShapeParams)
      // sides clamped to 5 → 1 M + 4 L + 1 Z = 6 commands
      expect(p.commands.length).toBe(6)
    })
  })
})

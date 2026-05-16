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
})

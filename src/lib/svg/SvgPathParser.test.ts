import { describe, it, expect } from 'vitest'
import { SvgPathParser } from './SvgPathParser'
import type { SvgImportWarning } from '@/lib/types/svg'

const p = new SvgPathParser()

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('SvgPathParser', () => {
  it('empty / null returns empty array', () => {
    expect(p.parse('')).toEqual([])
    expect(p.parse('   ')).toEqual([])
  })

  // ── Basic absolute commands ────────────────────────────────────────────────

  it('M followed by L', () => {
    expect(p.parse('M 10 20 L 30 40')).toEqual([
      { type: 'M', x: 10, y: 20 },
      { type: 'L', x: 30, y: 40 },
    ])
  })

  it('Z closes the path', () => {
    expect(p.parse('M 0 0 L 10 0 Z')).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'Z' },
    ])
  })

  it('H and V expand to L', () => {
    const r = p.parse('M 0 0 H 10 V 20')
    expect(r).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 20 },
    ])
  })

  // ── Relative → Absolute ────────────────────────────────────────────────────

  it('relative m converts to absolute M', () => {
    const r = p.parse('M 5 5 m 10 10')   // second m → l, since following M args are L
    // 'm' starts a new subpath at (5+10, 5+10) = (15, 15)
    expect(r).toEqual([
      { type: 'M', x: 5,  y: 5  },
      { type: 'M', x: 15, y: 15 },
    ])
  })

  it('relative l is added to current point', () => {
    expect(p.parse('M 5 5 l 10 0 l 0 10')).toEqual([
      { type: 'M', x: 5,  y: 5  },
      { type: 'L', x: 15, y: 5  },
      { type: 'L', x: 15, y: 15 },
    ])
  })

  it('relative h / v', () => {
    expect(p.parse('M 0 0 h 10 v 20')).toEqual([
      { type: 'M', x: 0,  y: 0  },
      { type: 'L', x: 10, y: 0  },
      { type: 'L', x: 10, y: 20 },
    ])
  })

  // ── Implicit repeat ────────────────────────────────────────────────────────

  it('M followed by extra coords becomes L', () => {
    expect(p.parse('M 0 0 10 10 20 20')).toEqual([
      { type: 'M', x: 0,  y: 0  },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 20, y: 20 },
    ])
  })

  it('implicit repeat for C', () => {
    const r = p.parse('M 0 0 C 1 1 2 2 3 3 4 4 5 5 6 6')
    expect(r.length).toBe(3)   // M + 2× C
    expect(r[2]).toMatchObject({ type: 'C', x: 6, y: 6 })
  })

  // ── Cubic bezier (C, S) ────────────────────────────────────────────────────

  it('C absolute', () => {
    const r = p.parse('M 0 0 C 10 0 20 10 30 10')
    expect(r[1]).toEqual({ type: 'C', x1: 10, y1: 0, x2: 20, y2: 10, x: 30, y: 10 })
  })

  it('S reflects previous C control point', () => {
    // After C 10 0 20 10 30 10, the previous c2 is (20, 10). At current point
    // (30, 10), the reflection is (40, 10). S 50 20 60 20 → C 40 10 50 20 60 20.
    const r = p.parse('M 0 0 C 10 0 20 10 30 10 S 50 20 60 20')
    expect(r[2]).toEqual({ type: 'C', x1: 40, y1: 10, x2: 50, y2: 20, x: 60, y: 20 })
  })

  it('S without preceding C reflects current point (i.e., x1=current)', () => {
    const r = p.parse('M 5 5 S 20 30 25 35')
    expect(r[1]).toEqual({ type: 'C', x1: 5, y1: 5, x2: 20, y2: 30, x: 25, y: 35 })
  })

  // ── Quadratic (Q, T) ───────────────────────────────────────────────────────

  it('Q absolute', () => {
    const r = p.parse('M 0 0 Q 10 0 20 10')
    expect(r[1]).toEqual({ type: 'Q', x1: 10, y1: 0, x: 20, y: 10 })
  })

  it('T reflects previous Q control', () => {
    // After Q 10 0 20 10, prev quad control = (10, 0). At current (20, 10),
    // reflection = (30, 20). T 40 30 → Q 30 20 40 30.
    const r = p.parse('M 0 0 Q 10 0 20 10 T 40 30')
    expect(r[2]).toEqual({ type: 'Q', x1: 30, y1: 20, x: 40, y: 30 })
  })

  // ── Arc (A) ────────────────────────────────────────────────────────────────

  it('A produces cubic beziers', () => {
    const r = p.parse('M 10 0 A 10 10 0 0 1 0 10')
    // M + at least one C
    expect(r[0]).toMatchObject({ type: 'M', x: 10, y: 0 })
    expect(r.length).toBeGreaterThan(1)
    for (let i = 1; i < r.length; i++) expect(r[i].type).toBe('C')
    // Final endpoint should land at (0, 10)
    const last = r[r.length - 1] as any
    close(last.x, 0)
    close(last.y, 10)
  })

  it('A with zero radius falls back to line', () => {
    const r = p.parse('M 0 0 A 0 5 0 0 1 10 0')
    expect(r).toEqual([
      { type: 'M', x: 0,  y: 0 },
      { type: 'L', x: 10, y: 0 },
    ])
  })

  // ── Z restores current point to subpath start ──────────────────────────────

  it('after Z, next M starts new subpath', () => {
    const r = p.parse('M 0 0 L 10 0 Z M 20 20 L 30 20')
    expect(r).toEqual([
      { type: 'M', x: 0,  y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'Z' },
      { type: 'M', x: 20, y: 20 },
      { type: 'L', x: 30, y: 20 },
    ])
  })

  it('relative l AFTER Z uses subpath start as current point', () => {
    // After Z, current point = subpath start (0,0). l 5 5 → L 5 5.
    const r = p.parse('M 0 0 L 10 0 Z l 5 5')
    expect(r[3]).toEqual({ type: 'L', x: 5, y: 5 })
  })

  // ── Terse number formatting ────────────────────────────────────────────────

  it('handles no space between sign and previous number', () => {
    expect(p.parse('M10 0l10-5')).toEqual([
      { type: 'M', x: 10, y: 0 },
      { type: 'L', x: 20, y: -5 },
    ])
  })

  it('handles decimals starting with .', () => {
    const r = p.parse('M.5.5l.3.3')
    expect(r[0]).toMatchObject({ type: 'M', x: 0.5, y: 0.5 })
    expect(r[1]).toMatchObject({ type: 'L', x: 0.8 })
    // 0.5 + 0.3 = 0.8 (within FP tolerance)
    close((r[1] as any).x, 0.8)
    close((r[1] as any).y, 0.8)
  })

  it('handles scientific notation', () => {
    const r = p.parse('M 1e2 1e1 L 1.5e1 -2e0')
    expect(r[0]).toMatchObject({ type: 'M', x: 100, y: 10 })
    expect(r[1]).toMatchObject({ type: 'L', x: 15,  y: -2 })
  })

  it('handles comma separators', () => {
    expect(p.parse('M 0,0 L 10,20')).toEqual([
      { type: 'M', x: 0,  y: 0  },
      { type: 'L', x: 10, y: 20 },
    ])
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  it('starting with a number emits warning and returns []', () => {
    const w: SvgImportWarning[] = []
    expect(p.parse('10 20 L 30 40', w)).toEqual([])
    expect(w[0]?.code).toBe('INVALID_PATH_DATA')
  })

  it('insufficient args emits warning', () => {
    const w: SvgImportWarning[] = []
    p.parse('M 10', w)
    expect(w.some(x => x.code === 'INVALID_PATH_DATA')).toBe(true)
  })

  it('unknown command emits warning', () => {
    const w: SvgImportWarning[] = []
    p.parse('M 0 0 X 10 10', w)
    expect(w.some(x => x.code === 'INVALID_PATH_DATA')).toBe(true)
  })
})

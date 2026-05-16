import { describe, it, expect } from 'vitest'
import { SvgTransformParser } from './SvgTransformParser'
import type { SvgImportWarning } from '@/lib/types/svg'

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('SvgTransformParser', () => {
  const p = new SvgTransformParser()

  it('null / empty returns identity', () => {
    expect(p.parse(null).isIdentity()).toBe(true)
    expect(p.parse('').isIdentity()).toBe(true)
    expect(p.parse('   ').isIdentity()).toBe(true)
  })

  it('translate(10, 20)', () => {
    const m = p.parse('translate(10, 20)')
    expect(m.e).toBe(10)
    expect(m.f).toBe(20)
  })

  it('translate(10) → ty defaults to 0', () => {
    const m = p.parse('translate(10)')
    expect(m.e).toBe(10)
    expect(m.f).toBe(0)
  })

  it('scale(2, 3)', () => {
    const m = p.parse('scale(2, 3)')
    expect(m.a).toBe(2)
    expect(m.d).toBe(3)
  })

  it('scale(2) is uniform', () => {
    const m = p.parse('scale(2)')
    expect(m.a).toBe(2)
    expect(m.d).toBe(2)
  })

  it('rotate(90)', () => {
    const m = p.parse('rotate(90)')
    const pt = m.applyToPoint({ x: 1, y: 0 })
    close(pt.x, 0)
    close(pt.y, 1)
  })

  it('rotate(90, 5, 5) rotates around (5,5)', () => {
    const m = p.parse('rotate(90, 5, 5)')
    // (5, 0) rotated 90° around (5, 5) → (10, 5)
    const pt = m.applyToPoint({ x: 5, y: 0 })
    close(pt.x, 10)
    close(pt.y, 5)
  })

  it('matrix(1 0 0 1 10 20) → translation', () => {
    const m = p.parse('matrix(1 0 0 1 10 20)')
    expect(m.a).toBe(1); expect(m.b).toBe(0)
    expect(m.c).toBe(0); expect(m.d).toBe(1)
    expect(m.e).toBe(10); expect(m.f).toBe(20)
  })

  it('composed: translate then rotate', () => {
    // SVG semantics: applied left to right.
    // "translate(10, 0) rotate(90)" => first translate(10,0) to local frame, then rotate(90) in that frame.
    // Equivalent matrix: T(10,0) × R(90)
    const m = p.parse('translate(10, 0) rotate(90)')
    // (1, 0) → R(90) → (0, 1) → T(10,0) → (10, 1)
    const pt = m.applyToPoint({ x: 1, y: 0 })
    close(pt.x, 10)
    close(pt.y, 1)
  })

  it('handles commas, spaces, missing args', () => {
    expect(p.parse('translate(  10 , 20  )').e).toBe(10)
    expect(p.parse('translate(10  20)').f).toBe(20)
  })

  it('unknown function emits warning, others still applied', () => {
    const warnings: SvgImportWarning[] = []
    const m = p.parse('skew3d(45) translate(10, 0)', warnings)
    expect(m.e).toBe(10)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('UNSUPPORTED_TRANSFORM')
  })

  it('skewX(45)', () => {
    const m = p.parse('skewX(45)')
    // skewX(45) sends (0, 1) to (1, 1)
    const pt = m.applyToPoint({ x: 0, y: 1 })
    close(pt.x, 1)
    close(pt.y, 1)
  })
})

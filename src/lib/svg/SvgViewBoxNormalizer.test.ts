import { describe, it, expect } from 'vitest'
import { SvgViewBoxNormalizer } from './SvgViewBoxNormalizer'

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps)

const stub = (attrs: Record<string, string | undefined>) => ({
  getAttribute: (k: string) => attrs[k] ?? null,
})

describe('SvgViewBoxNormalizer', () => {
  const n = new SvgViewBoxNormalizer()

  it('no viewBox, no width/height → defaults to 100×100 identity', () => {
    const ctx = n.createContext(stub({}))
    expect(ctx.rootMatrix.isIdentity()).toBe(true)
    expect(ctx.width).toBe(100)
    expect(ctx.height).toBe(100)
  })

  it('width/height without viewBox → identity scale, intrinsic size', () => {
    const ctx = n.createContext(stub({ width: '200', height: '150' }))
    expect(ctx.rootMatrix.isIdentity()).toBe(true)
    expect(ctx.width).toBe(200)
    expect(ctx.height).toBe(150)
  })

  it('viewBox with matching width/height → identity', () => {
    const ctx = n.createContext(stub({ viewBox: '0 0 100 100', width: '100', height: '100' }))
    close(ctx.rootMatrix.a, 1)
    close(ctx.rootMatrix.d, 1)
    expect(ctx.width).toBe(100)
    expect(ctx.height).toBe(100)
  })

  it('viewBox different from width — uniform scale via xMidYMid meet', () => {
    // viewBox 0 0 100 100, width 200 height 200 → scale × 2
    const ctx = n.createContext(stub({ viewBox: '0 0 100 100', width: '200', height: '200' }))
    close(ctx.rootMatrix.a, 2)
    close(ctx.rootMatrix.d, 2)
  })

  it('viewBox 0 0 100 100, width 200 height 100 — uses min(2, 1) = 1 by default (meet)', () => {
    const ctx = n.createContext(stub({ viewBox: '0 0 100 100', width: '200', height: '100' }))
    close(ctx.rootMatrix.a, 1)
    close(ctx.rootMatrix.d, 1)
    // xMid alignment offsets X by (200 - 100) / 2 = 50
    close(ctx.rootMatrix.e, 50)
  })

  it('preserveAspectRatio="none" → non-uniform scale', () => {
    const ctx = n.createContext(stub({
      viewBox: '0 0 100 100', width: '200', height: '100',
      preserveAspectRatio: 'none',
    }))
    close(ctx.rootMatrix.a, 2)
    close(ctx.rootMatrix.d, 1)
  })

  it('viewBox offset is removed', () => {
    // viewBox -50 -50 100 100 → root matrix shifts origin so (-50,-50) maps to (0,0)
    const ctx = n.createContext(stub({ viewBox: '-50 -50 100 100', width: '100', height: '100' }))
    const origin = ctx.rootMatrix.applyToPoint({ x: -50, y: -50 })
    close(origin.x, 0)
    close(origin.y, 0)
  })

  it('captures viewBox in result', () => {
    const ctx = n.createContext(stub({ viewBox: '0 0 200 100' }))
    expect(ctx.viewBox).toEqual({ x: 0, y: 0, width: 200, height: 100 })
  })

  it('opts.scale applies an extra uniform scale', () => {
    const ctx = n.createContext(stub({ viewBox: '0 0 100 100', width: '100', height: '100' }), { scale: 2 })
    close(ctx.rootMatrix.a, 2)
    close(ctx.rootMatrix.d, 2)
    expect(ctx.width).toBe(200)
  })
})

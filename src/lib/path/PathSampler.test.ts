import { describe, it, expect } from 'vitest'
import { PathSampler } from './PathSampler'
import { M, L, C } from '@/lib/geometry'

const close = (a: number, b: number, eps = 1e-2) => expect(Math.abs(a - b)).toBeLessThan(eps)

describe('PathSampler', () => {
  const s = new PathSampler()

  it('straight line: arc-length matches Euclidean distance', () => {
    const t = s.buildLengthTable({
      closed: false,
      commands: [M(0, 0), L(100, 0)],
    })
    close(t.totalLength, 100)
  })

  it('horizontal line: midpoint at progress 0.5 is (50, 0)', () => {
    const t = s.buildLengthTable({
      closed: false,
      commands: [M(0, 0), L(100, 0)],
    })
    const mid = t.pointAtProgress(0.5)
    close(mid.x, 50)
    close(mid.y, 0)
  })

  it('tangent of horizontal line points +X', () => {
    const t = s.buildLengthTable({
      closed: false,
      commands: [M(0, 0), L(10, 0)],
    })
    const mid = t.pointAtProgress(0.5)
    close(mid.tangentX, 1)
    close(mid.tangentY, 0)
    close(mid.angle, 0)
  })

  it('vertical line: tangent points +Y, angle is 90°', () => {
    const t = s.buildLengthTable({
      closed: false,
      commands: [M(0, 0), L(0, 10)],
    })
    const mid = t.pointAtProgress(0.5)
    close(mid.tangentX, 0)
    close(mid.tangentY, 1)
    close(mid.angle, 90)
  })

  it('right angle L-shape: total length = sum of legs', () => {
    const t = s.buildLengthTable({
      closed: false,
      commands: [M(0, 0), L(100, 0), L(100, 50)],
    })
    close(t.totalLength, 150)
  })

  it('cubic bezier: approximately linear ≈ chord length', () => {
    // Control points along the line — should be very close to a straight line.
    const t = s.buildLengthTable({
      closed: false,
      commands: [M(0, 0), C(25, 0, 75, 0, 100, 0)],
    })
    close(t.totalLength, 100, 0.5)   // within 0.5 px tolerance
  })

  it('caching: same path returns same table instance', () => {
    const path = { closed: false, commands: [M(0, 0), L(10, 0)] }
    const a = s.buildLengthTable(path)
    const b = s.buildLengthTable(path)
    expect(a).toBe(b)
  })

  it('closed path: Z adds the closing segment to length', () => {
    const t = s.buildLengthTable({
      closed: true,
      commands: [M(0, 0), L(10, 0), L(10, 10), L(0, 10), { type: 'Z' }],
    })
    close(t.totalLength, 40)   // 4 sides × 10
  })

  it('progress clamps to [0, 1]', () => {
    const t = s.buildLengthTable({ closed: false, commands: [M(0, 0), L(10, 0)] })
    const a = t.pointAtProgress(-1)
    const b = t.pointAtProgress( 2)
    close(a.x, 0)
    close(b.x, 10)
  })
})

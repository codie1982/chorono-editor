import { describe, it, expect } from 'vitest'
import { clamp, snapToGrid } from './coordinateMath'
import { applyAxisLock } from './moveMath'
import { wrapAngle180, angleDegFromPivot, rotatePointAroundPivot } from './rotateMath'
import { scaleFactorFromDelta, clampScale, scaleTransformAroundPivot, MIN_SCALE } from './scaleMath'
import { calculateAnchorMove } from './anchorMath'
import { calculateResize } from './resizeMath'

describe('coordinateMath', () => {
  it('clamp keeps values inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
  it('snapToGrid rounds to nearest step, no-op for step<=0', () => {
    expect(snapToGrid(13, 10)).toBe(10)
    expect(snapToGrid(16, 10)).toBe(20)
    expect(snapToGrid(7, 5)).toBe(5)
    expect(snapToGrid(8, 5)).toBe(10)
    expect(snapToGrid(42, 0)).toBe(42)
  })
})

describe('moveMath.applyAxisLock', () => {
  it('hard axis lock wins', () => {
    expect(applyAxisLock(10, 5, 'x', false)).toEqual({ dx: 10, dy: 0 })
    expect(applyAxisLock(10, 5, 'y', false)).toEqual({ dx: 0, dy: 5 })
  })
  it('shift locks to the dominant axis', () => {
    expect(applyAxisLock(10, 5, null, true)).toEqual({ dx: 10, dy: 0 })
    expect(applyAxisLock(5, 10, null, true)).toEqual({ dx: 0, dy: 10 })
  })
  it('passes the delta through with no constraint', () => {
    expect(applyAxisLock(10, 5, null, false)).toEqual({ dx: 10, dy: 5 })
  })
})

describe('rotateMath', () => {
  it('wrapAngle180 normalises into (-180, 180]', () => {
    expect(wrapAngle180(270)).toBe(-90)
    expect(wrapAngle180(-270)).toBe(90)
    expect(wrapAngle180(180)).toBe(180)
    expect(wrapAngle180(-180)).toBe(-180)
    expect(wrapAngle180(540)).toBe(180)
  })
  it('angleDegFromPivot returns atan2 degrees', () => {
    expect(angleDegFromPivot(0, 0, 1, 0)).toBeCloseTo(0)
    expect(angleDegFromPivot(0, 0, 0, 1)).toBeCloseTo(90)
    expect(angleDegFromPivot(0, 0, -1, 0)).toBeCloseTo(180)
    expect(angleDegFromPivot(0, 0, 0, -1)).toBeCloseTo(-90)
  })
  it('rotatePointAroundPivot rotates by delta', () => {
    const p = rotatePointAroundPivot(1, 0, 0, 0, 90)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(1)
  })
})

describe('scaleMath', () => {
  it('scaleFactorFromDelta maps drag to per-axis factors', () => {
    expect(scaleFactorFromDelta(100, 0, 'x')).toEqual({ factorX: 2, factorY: 1 })
    expect(scaleFactorFromDelta(0, 100, 'y')).toEqual({ factorX: 1, factorY: 2 })
    expect(scaleFactorFromDelta(100, 50, 'both')).toEqual({ factorX: 2, factorY: 2 })
    expect(scaleFactorFromDelta(50, 100, 'both')).toEqual({ factorX: 2, factorY: 2 })
  })
  it('clampScale floors at MIN_SCALE', () => {
    expect(clampScale(1, 2)).toBe(2)
    expect(clampScale(2, 0.5)).toBe(1)
    expect(clampScale(1, 0.001)).toBe(MIN_SCALE)
  })
  it('scaleTransformAroundPivot pushes the anchor away from the pivot', () => {
    expect(scaleTransformAroundPivot(10, 10, 0, 0, 0, 0, 2, 2)).toEqual({ x: 20, y: 20 })
    // anchor already at pivot → position unchanged
    expect(scaleTransformAroundPivot(5, 5, 0, 0, 5, 5, 3, 3)).toEqual({ x: 5, y: 5 })
  })
})

describe('anchorMath.calculateAnchorMove', () => {
  it('leaves position fixed when un-rotated / un-scaled', () => {
    const r = calculateAnchorMove({
      x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1,
      dx: 10, dy: 20, snapGrid: false, snapPixel: false, gridSize: 10,
    })
    expect(r).toEqual({ anchorX: 10, anchorY: 20, x: 0, y: 0 })
  })
  it('compensates position to stay visually pinned when rotated', () => {
    const r = calculateAnchorMove({
      x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 90, scaleX: 1, scaleY: 1,
      dx: 10, dy: 0, snapGrid: false, snapPixel: false, gridSize: 10,
    })
    expect(r.anchorX).toBeCloseTo(0)
    expect(r.anchorY).toBeCloseTo(-10)
    expect(r.x).toBeCloseTo(10)
    expect(r.y).toBeCloseTo(10)
  })
  it('snaps the anchor world position to the grid', () => {
    const r = calculateAnchorMove({
      x: 0, y: 0, anchorX: 3, anchorY: 3, rotationDeg: 0, scaleX: 1, scaleY: 1,
      dx: 5, dy: 5, snapGrid: true, snapPixel: false, gridSize: 10,
    })
    expect(r).toEqual({ anchorX: 10, anchorY: 10, x: 0, y: 0 })
  })
})

describe('resizeMath.calculateResize', () => {
  const base = {
    x: 0, y: 0, width: 100, height: 100, anchorX: 50, anchorY: 50,
    dx: 0, dy: 0, proportional: false, snapPixel: false, minSize: 4,
    boundsWidth: 1000, boundsHeight: 1000,
  }

  it('grows from the SE handle and keeps anchor proportional', () => {
    const r = calculateResize({ ...base, handle: 'se', dx: 10, dy: 20 })
    expect(r).toEqual({ x: 0, y: 0, width: 110, height: 120, anchorX: 55, anchorY: 60 })
  })

  it('re-anchors x/y when dragging the NW handle', () => {
    const r = calculateResize({
      ...base, x: 100, y: 100, anchorX: 0, anchorY: 0, handle: 'nw', dx: 10, dy: 10,
    })
    expect(r).toEqual({ x: 110, y: 110, width: 90, height: 90, anchorX: 0, anchorY: 0 })
  })

  it('clamps position + size to the composition bounds', () => {
    const r = calculateResize({ ...base, x: 950, handle: 'e', dx: 100 })
    expect(r.width).toBe(200)
    expect(r.x).toBe(800)
  })

  it('aspect-locks to the dominant axis when proportional', () => {
    const r = calculateResize({
      ...base, width: 100, height: 50, anchorX: 0, anchorY: 0,
      handle: 'se', dx: 20, dy: 0, proportional: true,
    })
    expect(r.width).toBe(120)
    expect(r.height).toBe(60)
  })

  it('rounds to integer px when snapPixel is on', () => {
    const r = calculateResize({ ...base, handle: 'se', dx: 10.4, dy: 20.6, snapPixel: true })
    expect(Number.isInteger(r.width)).toBe(true)
    expect(Number.isInteger(r.height)).toBe(true)
    expect(r.width).toBe(110)
    expect(r.height).toBe(121)
  })
})

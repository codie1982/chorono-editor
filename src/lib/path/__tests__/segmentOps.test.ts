import { describe, it, expect } from 'vitest'
import { hitTestSegment, insertAnchorOnSegment } from '../pathOps'
import type { BezierPath } from '../../types'

/** A simple 2-anchor open path: straight diagonal from (0,0) to (100,100)
 *  with the bezier handles set so it's an exact straight line (handles
 *  on the line between endpoints). */
function diagPath(): BezierPath {
  return {
    closed: false,
    anchors: [
      { x: 0,   y: 0,   outX: 33,  outY: 33,  pointType: 'corner' },
      { x: 100, y: 100, inX:  67,  inY:  67,  pointType: 'corner' },
    ],
  }
}

/** A square closed path with 4 anchors (no curves — straight segments). */
function squarePath(): BezierPath {
  return {
    closed: true,
    anchors: [
      { x: 0,   y: 0,   outX:  33, outY:  0,   pointType: 'corner' },
      { x: 100, y: 0,   inX:   67, inY:  0,    outX: 100, outY:  33, pointType: 'corner' },
      { x: 100, y: 100, inX:  100, inY:  67,   outX:  67, outY: 100, pointType: 'corner' },
      { x: 0,   y: 100, inX:   33, inY: 100,   outX:   0, outY:  67, pointType: 'corner' },
    ],
  }
}

describe('hitTestSegment (BL-03)', () => {
  it('returns null for paths with < 2 anchors', () => {
    expect(hitTestSegment({ closed: false, anchors: [] }, 0, 0)).toBeNull()
    expect(hitTestSegment(
      { closed: false, anchors: [{ x: 0, y: 0, pointType: 'corner' }] },
      0, 0,
    )).toBeNull()
  })

  it('hits the middle of a diagonal segment', () => {
    const hit = hitTestSegment(diagPath(), 50, 50, 5)
    expect(hit).not.toBeNull()
    expect(hit!.segmentIndex).toBe(0)
    expect(hit!.t).toBeCloseTo(0.5, 1)
    expect(Math.hypot(hit!.hitX - 50, hit!.hitY - 50)).toBeLessThan(2)
  })

  it('returns null when click is outside the radius', () => {
    expect(hitTestSegment(diagPath(), 50, 0, 5)).toBeNull()
    expect(hitTestSegment(diagPath(), 200, 200, 5)).toBeNull()
  })

  it('excludes hits very close to anchors (those belong to anchor hit-test)', () => {
    // Click within radius of the start anchor — should be excluded
    expect(hitTestSegment(diagPath(), 1, 1, 5)).toBeNull()
    // Click within radius of the end anchor
    expect(hitTestSegment(diagPath(), 99, 99, 5)).toBeNull()
  })

  it('finds the correct segment in a closed square path', () => {
    const path = squarePath()
    // Top edge: y=0, x mid → segment 0 (anchor[0]→anchor[1])
    expect(hitTestSegment(path, 50,   2, 5)?.segmentIndex).toBe(0)
    // Right edge: x=100, y mid → segment 1
    expect(hitTestSegment(path, 98,  50, 5)?.segmentIndex).toBe(1)
    // Bottom edge: y=100, x mid → segment 2
    expect(hitTestSegment(path, 50,  98, 5)?.segmentIndex).toBe(2)
    // Left edge: x=0, y mid → segment 3 (closing seg if path.closed)
    expect(hitTestSegment(path,  2,  50, 5)?.segmentIndex).toBe(3)
  })

  it('returns null for the closing segment of an open path', () => {
    const open = squarePath()
    open.closed = false
    // Left edge (closing) should not be reachable
    expect(hitTestSegment(open, 2, 50, 5)).toBeNull()
  })
})

describe('insertAnchorOnSegment (BL-03)', () => {
  it('adds one new anchor at the split point', () => {
    const before = diagPath()
    const after = insertAnchorOnSegment(before, 0, 0.5)
    expect(after.anchors).toHaveLength(3)
    // Middle anchor should be approximately (50, 50)
    expect(after.anchors[1].x).toBeCloseTo(50, 0)
    expect(after.anchors[1].y).toBeCloseTo(50, 0)
  })

  it('keeps the curve visually identical (preserves endpoint values)', () => {
    const before = diagPath()
    const after = insertAnchorOnSegment(before, 0, 0.3)
    // Endpoints unchanged
    expect(after.anchors[0].x).toBe(0)
    expect(after.anchors[0].y).toBe(0)
    expect(after.anchors[2].x).toBe(100)
    expect(after.anchors[2].y).toBe(100)
  })

  it('updates surrounding anchors\' handles to preserve the curve', () => {
    const before = diagPath()
    const after = insertAnchorOnSegment(before, 0, 0.5)
    // anchor[0]'s outX should have shrunk (towards the split)
    expect(after.anchors[0].outX).toBeLessThan(before.anchors[0].outX!)
    // anchor[2]'s inX should have grown (towards the split)
    expect(after.anchors[2].inX).toBeGreaterThan(before.anchors[1].inX!)
  })

  it('sets the new anchor to "smooth" point type', () => {
    const after = insertAnchorOnSegment(diagPath(), 0, 0.5)
    expect(after.anchors[1].pointType).toBe('smooth')
    expect(after.anchors[1].inX).toBeDefined()
    expect(after.anchors[1].outX).toBeDefined()
  })

  it('inserts at the right index for a closed-path closing segment', () => {
    const before = squarePath()
    expect(before.anchors).toHaveLength(4)
    // Closing segment = index 3 (from anchor[3] back to anchor[0])
    const after = insertAnchorOnSegment(before, 3, 0.5)
    // 4 originals + 1 new = 5; new sits at index 4 (after anchor[3])
    expect(after.anchors).toHaveLength(5)
    // The split point must lie on the left edge of the square (x=0); the y
    // depends on the bezier handles, which aren't a straight line in this
    // test fixture — so we just check x stays on the edge.
    expect(after.anchors[4].x).toBeCloseTo(0, 1)
    expect(after.anchors[4].y).toBeGreaterThan(0)
    expect(after.anchors[4].y).toBeLessThan(100)
  })

  it('insertAnchorOnSegment + hitTestSegment round-trip', () => {
    const before = diagPath()
    const hit = hitTestSegment(before, 60, 60, 5)
    expect(hit).not.toBeNull()
    const after = insertAnchorOnSegment(before, hit!.segmentIndex, hit!.t)
    expect(after.anchors).toHaveLength(3)
    // The new anchor should be close to where we clicked
    expect(Math.hypot(after.anchors[1].x - hit!.hitX, after.anchors[1].y - hit!.hitY))
      .toBeLessThan(1)
  })
})

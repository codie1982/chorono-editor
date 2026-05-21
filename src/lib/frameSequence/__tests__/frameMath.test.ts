import { describe, it, expect } from 'vitest'
import { frameAtTime, frameRect, sequenceDurationMs } from '../frameMath'
import type { FrameSequenceData } from '../../types/media'

const cfg = (over: Partial<FrameSequenceData> = {}): FrameSequenceData => ({
  assetId: 'a1',
  columns: 4,
  rows: 2,
  frameCount: 8,
  frameWidth: 32,
  frameHeight: 32,
  fps: 10,            // 100ms per frame
  loop: true,
  ...over,
})

describe('frameAtTime', () => {
  it('returns frame 0 before/at start', () => {
    expect(frameAtTime(0, 0, cfg())).toBe(0)
    expect(frameAtTime(-50, 0, cfg())).toBe(0)
    expect(frameAtTime(50, 100, cfg())).toBe(0) // before layer start
  })

  it('advances one frame per 1000/fps ms', () => {
    const c = cfg() // 100ms/frame
    expect(frameAtTime(0, 0, c)).toBe(0)
    expect(frameAtTime(99, 0, c)).toBe(0)
    expect(frameAtTime(100, 0, c)).toBe(1)
    expect(frameAtTime(250, 0, c)).toBe(2)
    expect(frameAtTime(700, 0, c)).toBe(7)
  })

  it('accounts for layer startMs', () => {
    const c = cfg()
    expect(frameAtTime(500, 500, c)).toBe(0)
    expect(frameAtTime(650, 500, c)).toBe(1)
  })

  it('loops when loop is true', () => {
    const c = cfg({ loop: true }) // 8 frames, 100ms each → 800ms cycle
    expect(frameAtTime(800, 0, c)).toBe(0)  // wrapped
    expect(frameAtTime(900, 0, c)).toBe(1)
    expect(frameAtTime(1650, 0, c)).toBe(0) // 16.5 frames → 16 % 8 = 0
  })

  it('clamps to last frame when loop is false', () => {
    const c = cfg({ loop: false })
    expect(frameAtTime(800, 0, c)).toBe(7)
    expect(frameAtTime(5000, 0, c)).toBe(7)
  })

  it('defaults loop to true when undefined', () => {
    const c = cfg({ loop: undefined })
    expect(frameAtTime(800, 0, c)).toBe(0)
  })

  it('handles fps <= 0 defensively', () => {
    const c = cfg({ fps: 0 })
    expect(() => frameAtTime(100, 0, c)).not.toThrow()
    expect(frameAtTime(0, 0, c)).toBe(0)
  })
})

describe('frameRect', () => {
  it('maps index to grid cell (row-major)', () => {
    const c = cfg() // 4 cols, 32px cells
    expect(frameRect(0, c)).toEqual({ sx: 0,  sy: 0,  sw: 32, sh: 32 })
    expect(frameRect(1, c)).toEqual({ sx: 32, sy: 0,  sw: 32, sh: 32 })
    expect(frameRect(3, c)).toEqual({ sx: 96, sy: 0,  sw: 32, sh: 32 })
    expect(frameRect(4, c)).toEqual({ sx: 0,  sy: 32, sw: 32, sh: 32 }) // wraps to row 2
    expect(frameRect(5, c)).toEqual({ sx: 32, sy: 32, sw: 32, sh: 32 })
  })

  it('clamps out-of-range indices', () => {
    const c = cfg()
    expect(frameRect(-3, c)).toEqual(frameRect(0, c))
    expect(frameRect(99, c)).toEqual(frameRect(7, c))
  })

  it('respects non-square cells', () => {
    const c = cfg({ columns: 2, frameWidth: 64, frameHeight: 48, frameCount: 4 })
    expect(frameRect(2, c)).toEqual({ sx: 0, sy: 48, sw: 64, sh: 48 })
  })
})

describe('sequenceDurationMs', () => {
  it('computes total playthrough duration', () => {
    expect(sequenceDurationMs(cfg())).toBe(800)            // 8 / 10 * 1000
    expect(sequenceDurationMs(cfg({ fps: 24, frameCount: 12 }))).toBe(500)
  })
})

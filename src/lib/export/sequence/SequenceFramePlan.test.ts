import { describe, expect, it } from 'vitest'
import { resolveSequenceFramePlan, sequenceFrameTimeMs } from './SequenceFramePlan'

describe('sequence frame planning', () => {
  it('preserves full-composition sampling from zero', () => {
    const plan = resolveSequenceFramePlan(1000, 24)
    expect(plan).toEqual({ fps: 24, startTimeMs: 0, frameCount: 24 })
    expect(sequenceFrameTimeMs(plan, 23)).toBeCloseTo(958.333)
  })

  it('supports an exact current-frame range without shifting the playhead', () => {
    const plan = resolveSequenceFramePlan(5000, 30, { startTimeMs: 2345, frameCount: 1 })
    expect(sequenceFrameTimeMs(plan, 0)).toBe(2345)
  })

  it('rejects invalid ranges before allocating output resources', () => {
    expect(() => resolveSequenceFramePlan(1000, 30, { startTimeMs: -1, frameCount: 1 })).toThrow('start time')
    expect(() => resolveSequenceFramePlan(1000, 30, { frameCount: 4097 })).toThrow('4096-frame')
    expect(() => resolveSequenceFramePlan(1000, 30, { frameCount: 1.5 })).toThrow('4096-frame')
  })
})

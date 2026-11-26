import { describe, expect, it } from 'vitest'
import { SimulationClock } from './SimulationClock'

describe('SimulationClock', () => {
  it('creates exact inclusive fixed-step sample schedules', () => {
    const thirty = new SimulationClock({ durationMs: 3000, stepHz: 120, sampleFps: 30 })
    expect(thirty.totalTicks).toBe(360)
    expect(thirty.sampleStrideTicks).toBe(4)
    expect(thirty.sampleCount).toBe(91)
    expect(thirty.sampleIndexForTick(360)).toBe(90)
    expect(Array.from(thirty.sampleTimesMs()).slice(-2)).toEqual([3000 - 1000 / 30, 3000])

    const sixty = new SimulationClock({ durationMs: 3000, stepHz: 120, sampleFps: 60 })
    expect(sixty.sampleCount).toBe(181)
  })

  it('rejects fractional ticks and output rates that do not divide the solver rate', () => {
    expect(() => new SimulationClock({ durationMs: 1001, stepHz: 120, sampleFps: 30 })).toThrow(/integer fixed-step/)
    expect(() => new SimulationClock({ durationMs: 1000, stepHz: 120, sampleFps: 29 })).toThrow(/divide/)
    expect(() => new SimulationClock({ durationMs: 0, stepHz: 120, sampleFps: 30 })).toThrow(/positive/)
  })
})

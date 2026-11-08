import { describe, expect, it } from 'vitest'
import { BaselineRecorder } from './BaselineRecorder'
import { DEFAULT_BASELINE_PROTOCOL, validateBaselineProtocol, type BaselineSample } from './types'
import { summarizeNumbers } from '../performance/sampleStatistics'

/** Minimal numeric row; fields model diagnostics, not scene/renderer implementation. */
function sample(repetition: number, timeMs: number): BaselineSample {
  return { repetition, timeMs, evaluationMs: 1, renderMs: 3, layerVisits: 3000, knownBytes: 1024,
    heapBytes: null, canvas2dBytes: 1024, canvas2dCount: 1, canvasRegistrations: 1,
    maskResidentBytes: 0, maskAllocations: 0, maskReuses: 0, imageBytes: 0,
    videoFrameBytes: 0, pcmBytes: 0, gpuBufferBytes: 0, gpuDrawCalls: 0, gpuMs: null }
}
const protocol = { ...DEFAULT_BASELINE_PROTOCOL, warmupMs: 0, repetitions: 2, sampleFractions: [0, 0.5] }

describe('repeatable baseline protocol', () => {
  it('uses nearest-rank quantiles without mutating input or inventing missing values', () => {
    const values = [9, 1, 3, 7]
    expect(summarizeNumbers(values)).toMatchObject({ p50: 3, p95: 9, mean: 5 })
    expect(values).toEqual([9, 1, 3, 7])
    expect(summarizeNumbers([])).toBeNull()
  })
  it.each([
    { repetitions: 0 }, { repetitions: Infinity }, { sampleFractions: [0, 0] },
    { sampleFractions: [1] }, { sampleFractions: [-0.1] }, { warmupMs: NaN }, { knownByteLimit: 0 },
    { repetitions: 100, sampleFractions: Array.from({ length: 13 }, (_, i) => i / 13) },
  ])('rejects unsafe protocol %j before running', patch => {
    expect(() => validateBaselineProtocol({ ...protocol, ...patch })).toThrow(RangeError)
  })
  it('retains copied bounded ordered samples and keeps partial/aborted runs incomplete', () => {
    const recorder = new BaselineRecorder(protocol)
    const first = sample(0, 0)
    recorder.record(first); first.renderMs = 999
    expect(recorder.finish().status).toBe('incomplete')
    expect(() => recorder.record(sample(0, 0))).toThrow(RangeError)
    recorder.record(sample(0, 500)); recorder.record(sample(1, 0)); recorder.record(sample(1, 500))
    const report = recorder.finish()
    expect(report.status).toBe('complete')
    expect(report.summary.renderMs?.p95).toBe(3)
    expect(report.summary.heapBytes).toBeNull()
    expect(() => recorder.record(sample(2, 0))).toThrow(RangeError)
    expect(recorder.finish('cancelled').status).toBe('incomplete')
  })
  it('separates known/heap guard rails without summing overlapping memory categories', () => {
    const recorder = new BaselineRecorder(protocol)
    expect(recorder.memoryStopReason(protocol.knownByteLimit, protocol.heapByteLimit)).toBeNull()
    expect(recorder.memoryStopReason(protocol.knownByteLimit + 1, null)).toBe('known-resource-limit')
    expect(recorder.memoryStopReason(0, protocol.heapByteLimit + 1)).toBe('heap-limit')
  })
})

it('preserves historical rows without optional paint fields and rejects supplied invalid numeric diagnostics', () => {
  const old = new BaselineRecorder(protocol)
  old.record(sample(0, 0))
  expect(old.finish().samples[0].processedLayers).toBeUndefined()
  const current = new BaselineRecorder(protocol)
  current.record({ ...sample(0, 0), processedLayers: 300, culledLayers: 2700 })
  expect(current.finish().samples[0].culledLayers).toBe(2700)
  for (const patch of [{ renderMs: undefined }, { processedLayers: NaN }, { culledLayers: -1 }]) {
    const recorder = new BaselineRecorder(protocol)
    expect(() => recorder.record({ ...sample(0, 0), ...patch } as BaselineSample)).toThrow(RangeError)
  }
})

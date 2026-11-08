import { describe, expect, it } from 'vitest'
import { VisibleTimeClock } from './VisibleTimeClock'
import { BaselineRunner, type BaselineHost } from './BaselineRunner'
import { DEFAULT_BASELINE_PROTOCOL, type BaselineSample } from './types'

/** Clock/render adapter avoids wall-time sleeps while testing run completion and guard/cancel contracts. */
function host(extra: Partial<BaselineSample> = {}): BaselineHost {
  let time = 0
  return { durationMs: 48000, activeNow: () => time,
    nextFrame: async signal => { if (signal.aborted) throw new Error('cancelled'); time += 1000 },
    draw: (timeMs, repetition) => ({ repetition, timeMs, evaluationMs: 1, renderMs: 2,
      layerVisits: 3000, knownBytes: 8, heapBytes: null, canvas2dBytes: 8, canvas2dCount: 1, canvasRegistrations: 1,
      maskResidentBytes: 0, maskAllocations: 0, maskReuses: 0, imageBytes: 0, videoFrameBytes: 0, pcmBytes: 0,
      gpuBufferBytes: 0, gpuDrawCalls: 0, gpuMs: null, ...extra }), checkpoint: async () => 'hash' }
}
describe('baseline execution', () => {
  it('requires active warmup and exactly 10 × 6 ordered frames, without presenting them as playback loops', async () => {
    const result = await new BaselineRunner(DEFAULT_BASELINE_PROTOCOL).run(host(), new AbortController().signal)
    expect(result.status).toBe('complete')
    expect(result.warmup.frames).toBe(60)
    expect(result.samples).toHaveLength(60)
    expect(result.checkpoints).toHaveLength(6)
    expect(result.samples.at(-1)?.timeMs).toBeCloseTo(47999)
  })
  it('reports safety interruption and cancellation as incomplete with the available samples', async () => {
    const runner = new BaselineRunner(DEFAULT_BASELINE_PROTOCOL)
    const guarded = await runner.run(host({ knownBytes: DEFAULT_BASELINE_PROTOCOL.knownByteLimit + 1 }), new AbortController().signal)
    expect(guarded).toMatchObject({ status: 'incomplete', reason: 'known-resource-limit' })
    expect(guarded.samples).toHaveLength(0)
    const controller = new AbortController(); controller.abort()
    expect(await runner.run(host(), controller.signal)).toMatchObject({ status: 'incomplete', reason: 'cancelled' })
  })
  it('runs pixel readbacks after all measured frames so readback cannot change the timed backend', async () => {
    const adapter = host()
    const calls: string[] = []
    const draw = adapter.draw
    adapter.draw = (time, repetition) => { calls.push('draw'); return draw(time, repetition) }
    adapter.checkpoint = async () => { calls.push('readback'); return 'hash' }
    const result = await new BaselineRunner({ ...DEFAULT_BASELINE_PROTOCOL, warmupMs: 0 }).run(adapter, new AbortController().signal)
    expect(result.status).toBe('complete')
    expect(calls.indexOf('readback')).toBe(61)
  })
  it('excludes hidden intervals from the visible monotonic clock', () => {
    const clock = new VisibleTimeClock(true, 100)
    expect(clock.read(600)).toBe(500)
    clock.setVisible(false, 600)
    expect(clock.read(5000)).toBe(500)
    clock.setVisible(true, 5000)
    expect(clock.read(5500)).toBe(1000)
    expect(() => clock.read(4999)).toThrow(RangeError)
  })
})

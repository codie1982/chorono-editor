import { expect, it, vi } from 'vitest'
import { GpuWorkRegistry } from './GpuWorkRegistry'

it('reference-counts visible observers and turns off queries on final unsubscribe/dispose', () => {
  const registry = new GpuWorkRegistry()
  const setSampling = vi.fn()
  const first = registry.observe()
  const unregister = registry.register({ setSampling, getSnapshot: () => ({ backend: 'test', contextLost: false,
    bufferBytes: 4, stagingBytes: 4, drawCalls: 1, lastInstances: 5, lastDrawAt: 1,
    timerSupported: false, gpuMs: null, gpuSampleAt: null }) })
  expect(setSampling).toHaveBeenLastCalledWith(true)
  const second = registry.observe()
  first(); first()
  expect(setSampling).not.toHaveBeenCalledWith(false)
  second()
  expect(setSampling).toHaveBeenLastCalledWith(false)
  expect(registry.getSnapshot()[0].drawCalls).toBe(1)
  unregister()
  expect(registry.getSnapshot()).toEqual([])
})

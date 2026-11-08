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

it('never cleans storage while polling and delegates explicit unused-resource cleanup', () => {
  const registry = new GpuWorkRegistry(), clearIdle = vi.fn()
  const unregister = registry.register({setSampling(){},clearIdle,getSnapshot:() => ({backend:'effect',contextLost:false,
    bufferBytes:48,stagingBytes:0,textureBytes:80,drawKind:'effect',drawCalls:2,lastInstances:0,lastDrawAt:1,
    timerSupported:false,gpuMs:null,gpuSampleAt:null})})
  expect(registry.getSnapshot()[0]).toMatchObject({textureBytes:80,drawKind:'effect'})
  expect(clearIdle).not.toHaveBeenCalled()
  registry.clearIdle();expect(clearIdle).toHaveBeenCalledOnce()
  unregister();registry.clearIdle();expect(clearIdle).toHaveBeenCalledOnce()
})

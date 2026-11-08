import { expect, it, vi } from 'vitest'
import { AudioAssetService } from './AudioAssetService'
import { BoundedBinaryReader } from '../resources/io'
import { ResourceBudget } from '../resources/budget'

/** Deterministic non-abortable native settlement; actual browser QA separately
 * validates WAV decoding through the same bounded adapter. */
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }

it('holds detached encoded input and PCM reservation until cancelled native decode actually settles', async () => {
  const budget = new ResourceBudget({ maxBytes: 128 }), native = deferred<AudioBuffer>(), started = deferred<void>(), abort = new AbortController()
  const service = new AudioAssetService({ budget, decodeReserveBytes: 32, maxBytes: 128,
    fetch: async () => new Response(new Uint8Array([1, 2, 3, 4])),
    createContext: () => ({ state: 'running', close: async () => {}, decodeAudioData(data: ArrayBuffer) {
      structuredClone(data, { transfer: [data] }); expect(data.byteLength).toBe(0); started.resolve(); return native.promise
    } } as unknown as AudioContext) })
  const pending = service.acquireUrl('source', { signal: abort.signal }), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await started.promise; abort.abort(); await rejected
  expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 36, categories: { input: { residentBytes: 4 }, audio: { reservedBytes: 32 } } })
  expect(service.getMemorySnapshot().preparation).toMatchObject({ active: 1, executing: 1 })
  native.resolve({ length: 8, numberOfChannels: 1 } as AudioBuffer)
  await vi.waitFor(() => expect(service.getMemorySnapshot().preparation!.active).toBe(0))
  expect(budget.getSnapshot().chargedBytes).toBe(0); expect(service.peek('source')).toBeUndefined(); await service.dispose()
})

it('rejects actual input overflow before creating a decoder/context and releases both reservations', async () => {
  const budget = new ResourceBudget({ maxBytes: 128 }), inputReader = new BoundedBinaryReader({ maxBytes: 3, budget }), createContext = vi.fn()
  const service = new AudioAssetService({ budget, inputReader, decodeReserveBytes: 32,
    fetch: async () => new Response(new Uint8Array(4), { headers: { 'content-length': '1' } }), createContext })
  await expect(service.acquireUrl('large')).rejects.toThrow('byte limit')
  expect(createContext).not.toHaveBeenCalled(); expect(budget.getSnapshot().chargedBytes).toBe(0)
  expect(inputReader.getSnapshot().chargedBytes).toBe(0); await service.dispose()
})

it('admits old+replacement input peak alongside PCM before native decode', async () => {
  const budget = new ResourceBudget({ maxBytes: 55 }), inputReader = new BoundedBinaryReader({ maxBytes: 16, budget }), createContext = vi.fn()
  let step = 0
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (++step === 1) controller.enqueue(new Uint8Array(8)); else if (step === 2) controller.enqueue(new Uint8Array(4)); else controller.close()
  } }, { highWaterMark: 0 })
  const service = new AudioAssetService({ budget, inputReader, decodeReserveBytes: 32, fetch: async () => new Response(stream), createContext })
  await expect(service.acquireUrl('overlap')).rejects.toThrow('growth')
  expect(createContext).not.toHaveBeenCalled(); expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, peakBytes: 40, denials: 1 })
  await service.dispose()
})

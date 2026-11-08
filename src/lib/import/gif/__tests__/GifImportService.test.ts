import { afterEach, expect, it, vi } from 'vitest'
import { GifImportService } from '../GifImportService'
import { GifBackendUnavailable, type DecodedGifSheet, type GifSheetPlan } from '../types'
import { ResourceBudget, type ResourceAllocator } from '../../../resources/budget'
import { BoundedJobQueue } from '../../../resources/jobs'
import { GifHandler } from '../../handlers/asset/GifHandler'
import { ImportManager } from '../../ImportManager'
import { releaseImportSources } from '../../resources/importSources'
import { animatedGif, staticGif } from './gifFixtures'

const file = () => new File([animatedGif()], 'animation.gif', { type: 'image/gif' })
/** Plain fake encoded result; unit tests isolate ownership/admission. Native QA
 * separately verifies that real output is valid PNG with exact RGBA/timing. */
const sheet = (plan: GifSheetPlan, size = 3): DecodedGifSheet => ({ blob: new Blob([new Uint8Array(size)], { type: 'image/png' }),
  sheetWidth: plan.sheetWidth, sheetHeight: plan.sheetHeight, frameWidth: plan.width, frameHeight: plan.height,
  frameCount: plan.frameCount, columns: plan.columns, rows: plan.rows, avgFrameMs: 200 })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

it('preflight uses bounded header data without native frames and output stays admitted until release', async () => {
  const budget = new ResourceBudget({ maxBytes: 1024 ** 2 })
  const compose = vi.fn(async (_buffer: ArrayBuffer, plan: GifSheetPlan) => {
    expect(budget.getSnapshot().chargedBytes).toBe(2 * 147 + plan.frameBytes + plan.sheetBytes + plan.encodeReserveBytes)
    return sheet(plan)
  })
  const service = new GifImportService({ budget, worker: false, main: { compose } })
  expect(await service.inspect(file())).toMatchObject({ frameCount: 3, sheetBytes: 256 }); expect(compose).not.toHaveBeenCalled()
  expect(budget.getSnapshot().chargedBytes).toBe(0)
  const prepared = await service.prepare(file())
  expect(prepared.sheet?.frameCount).toBe(3); expect(budget.getSnapshot()).toMatchObject({ residentBytes: 3, chargedBytes: 3 })
  prepared.release(); prepared.release(); expect(budget.getSnapshot().chargedBytes).toBe(0); expect(() => prepared.sheet).toThrow('released')
})

it('admits before native allocation and rejects caps/fatal backend errors without retry or static degradation', async () => {
  const main = { compose: vi.fn(async (_buffer: ArrayBuffer, plan: GifSheetPlan) => sheet(plan)) }, probeStatic = vi.fn(async () => {})
  const small = new GifImportService({ budget: new ResourceBudget({ maxBytes: 1000 }), worker: false, main, probeStatic })
  await expect(small.prepare(file())).rejects.toThrow('encoding'); expect(main.compose).not.toHaveBeenCalled(); expect(small.getSnapshot().chargedBytes).toBe(0)
  for (const error of [new RangeError('capacity'), Object.assign(new Error('timeout'), { name: 'TimeoutError' }), new Error('invalid compressed data')]) {
    const worker = { compose: vi.fn(async (): Promise<DecodedGifSheet> => { throw error }) }
    const service = new GifImportService({ worker, main, probeStatic })
    await expect(service.prepare(file())).rejects.toBe(error)
    expect(worker.compose).toHaveBeenCalledOnce(); expect(service.getSnapshot().chargedBytes).toBe(0)
  }
  expect(main.compose).not.toHaveBeenCalled(); expect(probeStatic).not.toHaveBeenCalled()
  const capped = new GifImportService({ maxFrames: 2, worker: false, main, probeStatic })
  await expect(capped.prepare(file())).rejects.toThrow('frame count'); expect(capped.getSnapshot().peakBytes).toBe(147)
})

it('allows only explicit pre-transfer unsupported fallback and preserves validated still metadata', async () => {
  const worker = { compose: vi.fn(async (): Promise<DecodedGifSheet> => { throw new GifBackendUnavailable('worker unavailable') }) }
  const main = { compose: vi.fn(async (_buffer: ArrayBuffer, plan: GifSheetPlan) => sheet(plan)) }, probeStatic = vi.fn(async () => {})
  const service = new GifImportService({ worker, main, probeStatic })
  const animated = await service.prepare(file()); animated.release()
  expect(main.compose).toHaveBeenCalledOnce(); expect(probeStatic).not.toHaveBeenCalled()
  const unsupported = new GifImportService({ worker: false, main: false, probeStatic })
  const still = await unsupported.prepare(file()); expect(still.sheet).toBeUndefined(); expect(still.metadata.frameCount).toBe(3)
  still.release(); expect(probeStatic).toHaveBeenCalledOnce(); expect(unsupported.getSnapshot().chargedBytes).toBe(0)
  const staticResult = await service.prepare(new File([staticGif()], 'static.gif'))
  expect(staticResult.sheet).toBeUndefined(); staticResult.release(); expect(worker.compose).toHaveBeenCalledOnce()
})

it('never retries detached input even if a backend incorrectly labels its failure as setup-unavailable', async () => {
  const main = { compose: vi.fn(async (_buffer: ArrayBuffer, plan: GifSheetPlan) => sheet(plan)) }
  const service = new GifImportService({ worker: { compose: async buffer => {
    structuredClone(buffer, { transfer: [buffer] }); throw new GifBackendUnavailable('late unavailable')
  } }, main })
  await expect(service.prepare(file())).rejects.toThrow('late unavailable'); expect(main.compose).not.toHaveBeenCalled()
  expect(service.getSnapshot().chargedBytes).toBe(0)
})

it('holds all overlapping input/native workspace/output charges until cancelled actual backend settlement', async () => {
  const budget = new ResourceBudget({ maxBytes: 1024 ** 2 }), started = Promise.withResolvers<void>(), done = Promise.withResolvers<void>(), abort = new AbortController()
  const service = new GifImportService({ budget, worker: false, main: { compose: async (_buffer, plan) => { started.resolve(); await done.promise; return sheet(plan) } } })
  const pending = service.prepare(file(), { signal: abort.signal }), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await started.promise; const charge = budget.getSnapshot().chargedBytes; abort.abort(); expect(budget.getSnapshot().chargedBytes).toBe(charge)
  done.resolve(); await rejected; expect(budget.getSnapshot().chargedBytes).toBe(0)
})

it('discards a prepared owned output when cancellation wins the final executor handoff', async () => {
  const budget = new ResourceBudget({ maxBytes: 1024 ** 2 }), abort = new AbortController()
  const allocator: ResourceAllocator = { reserve(category, bytes) {
    const ticket = budget.reserve(category, bytes)
    if (ticket) { const commit = ticket.commit; ticket.commit = () => { commit(); if (ticket.bytes === 3) abort.abort() } }
    return ticket
  } }
  const service = new GifImportService({ budget: allocator, worker: false, main: { compose: async (_buffer, plan) => sheet(plan) } })
  await expect(service.prepare(file(), { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(budget.getSnapshot().chargedBytes).toBe(0)
})

it('shared queue deadline cancels waiting IO before File read, retaining an active native slot until it settles', async () => {
  vi.useFakeTimers()
  const queue = new BoundedJobQueue({ concurrency: 1 }), started = Promise.withResolvers<void>(), done = Promise.withResolvers<void>()
  const service = new GifImportService({ executor: queue, timeoutMs: 100, worker: false, main: { compose: async (_buffer, plan) => { started.resolve(); await done.promise; return sheet(plan) } } })
  const first = service.prepare(file()), firstError = expect(first).rejects.toMatchObject({ name: 'TimeoutError' })
  await started.promise
  const waitingFile = file(), stream = vi.spyOn(waitingFile, 'stream'), waiting = service.prepare(waitingFile)
  const waitingError = expect(waiting).rejects.toMatchObject({ name: 'TimeoutError' })
  await vi.advanceTimersByTimeAsync(100); await waitingError
  expect(stream).not.toHaveBeenCalled(); expect(queue.getSnapshot()).toMatchObject({ active: 1, queued: 0 })
  expect(service.getSnapshot().chargedBytes).toBeGreaterThan(0)
  done.resolve(); await firstError; expect(service.getSnapshot().chargedBytes).toBe(0); expect(queue.getSnapshot().active).toBe(0); expect(vi.getTimerCount()).toBe(0)
})

it('handler adopts sheet into existing frameSequence/command/source contracts and cleans progress cancellation', async () => {
  const service = new GifImportService({ worker: false, main: { compose: async (_buffer, plan) => sheet(plan) } }), handler = new GifHandler(service), manager = new ImportManager()
  manager.registerHandler(handler)
  expect((await handler.preflight(file())).summary.detectedFeatures).toEqual(['4×4px', '3 frames (animated)'])
  const result = await manager.importFileAs(file(), 'image/gif')
  expect(result.assets[0]).toMatchObject({ type: 'spriteSheet', width: 8, height: 8, frameRate: 5 })
  expect(result.layers[0].frameSequence).toMatchObject({ frameCount: 3, frameWidth: 4, frameHeight: 4, columns: 2, rows: 2, fps: 5, loop: true })
  expect(result.commands).toHaveLength(1); expect(service.getSnapshot().chargedBytes).toBe(0)
  expect((await fetch(result.assets[0].url)).ok).toBe(true); releaseImportSources(result); await Promise.resolve(); await expect(fetch(result.assets[0].url)).rejects.toThrow()
  const abort = new AbortController(), create = vi.spyOn(URL, 'createObjectURL')
  await expect(handler.handle(file(), {}, progress => { if (progress.stage === 'complete') abort.abort() }, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(create).not.toHaveBeenCalled(); expect(service.getSnapshot().chargedBytes).toBe(0)
})

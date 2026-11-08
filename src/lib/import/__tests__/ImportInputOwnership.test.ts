import { expect, it, vi } from 'vitest'
import { ImportManager } from '../ImportManager'
import { BaseImportHandler } from '../handlers/BaseHandler'
import { withImportSource, releaseImportSources } from '../resources/importSources'
import { BoundedBinaryReader } from '../../resources/io'
import { ResourceBudget } from '../../resources/budget'
import type { ImportFormat, ImportResult, ImportEvent } from '../types'

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
/** Gate a legacy non-abortable conversion; result/source ownership is real. */
function gate() { let release!: () => void; const promise = new Promise<void>(yes => { release = yes }); return { promise, release } }

/** Minimal plugin adapter isolates input/transaction lifecycle from DOM image
 * probing. It uses the same original-source lease helper as native handlers. */
class Handler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = ['image/png']
  source = ''
  calls = 0
  constructor(private readonly hold?: () => Promise<void>) { super() }
  async preflight(): Promise<never> { throw new Error('Outside input lifecycle test') }
  async handle(file: File): Promise<ImportResult> {
    this.calls++
    return withImportSource(file, async url => {
      this.source = url; await this.hold?.()
      return { id: 'r', source: this.makeSource(file), format: 'image/png', kind: 'asset',
        assets: [{ id: 'a', name: file.name, type: 'image', url, runtime: { objectUrl: url } }],
        layers: [], groups: [], tracks: [], timelines: [], commands: [], warnings: [], errors: [], unsupportedFeatures: [],
        report: { title: 'Input', sourceFileName: file.name, format: 'image/png', created: { assets: 1, layers: 0, groups: 0, tracks: 0, compositions: 0 },
          warnings: [], errors: [], unsupportedFeatures: [], suggestions: [], durationMs: 0 } }
    })
  }
}

/** Fresh native response for every fetch; no unsafe arrayBuffer-only transport. */
function transport() { return new Response(bytes, { headers: { 'content-type': 'image/png' } }) }

it('admits URL input plus File-copy overlap, preserves MIME/content and keeps result sources independently owned', async () => {
  const budget = new ResourceBudget({ maxBytes: 32 }), inputReader = new BoundedBinaryReader({ maxBytes: 8, budget })
  const manager = new ImportManager({ inputReader, fetch: vi.fn(async () => transport()) }), handler = new Handler()
  manager.registerHandler(handler)
  const result = await manager.importUrl('http://localhost/image.png')
  expect(result.source).toMatchObject({ size: 8, mimeType: 'image/png', value: 'image.png' })
  expect(new Uint8Array(await (await fetch(handler.source)).arrayBuffer())).toEqual(bytes)
  expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, peakBytes: 16 })
  expect(result.commands).toHaveLength(1); releaseImportSources(result); await Promise.resolve()
  await expect(fetch(handler.source)).rejects.toThrow()
})

it('refuses File-copy overlap before invoking a handler and releases downloaded input', async () => {
  const budget = new ResourceBudget({ maxBytes: 15 }), inputReader = new BoundedBinaryReader({ maxBytes: 8, budget })
  const manager = new ImportManager({ inputReader, fetch: async () => transport() }), handler = new Handler()
  manager.registerHandler(handler)
  await expect(manager.importUrl('http://localhost/image.png')).rejects.toThrow('copy')
  expect(handler.calls).toBe(0); expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, peakBytes: 8 })
})

it('keeps cancelled legacy conversion inputs charged until actual completion and never publishes its result', async () => {
  const budget = new ResourceBudget({ maxBytes: 32 }), inputReader = new BoundedBinaryReader({ maxBytes: 8, budget })
  const entered = gate(), hold = gate(), manager = new ImportManager({ inputReader, fetch: async () => transport() })
  const handler = new Handler(async () => { entered.release(); await hold.promise }), abort = new AbortController(), events: ImportEvent[] = []
  manager.registerHandler(handler); manager.onImportEvent(event => events.push(event))
  const pending = manager.importUrl('http://localhost/image.png', {}, undefined, { signal: abort.signal })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await entered.promise; abort.abort()
  expect(budget.getSnapshot().chargedBytes).toBe(16); expect((await fetch(handler.source)).ok).toBe(true)
  hold.release(); await rejected
  expect(events.map(event => event.type)).toEqual(['importStart', 'importError'])
  expect(budget.getSnapshot().chargedBytes).toBe(0); await expect(fetch(handler.source)).rejects.toThrow()
})

it('checks cancellation caused by transaction progress before publishing complete', async () => {
  const manager = new ImportManager(), handler = new Handler(), abort = new AbortController(), events: string[] = []
  manager.registerHandler(handler); manager.onImportEvent(event => events.push(event.type))
  await expect(manager.importFileAs(new File([bytes], 'image.png'), 'image/png', {}, progress => {
    if (progress.stage === 'creating') abort.abort()
  }, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(events).toEqual(['importStart', 'importError']); await expect(fetch(handler.source)).rejects.toThrow()
})

it('pre-aborted imports do not fetch and dishonest actual response overflow does not reach a handler', async () => {
  const fetcher = vi.fn(async () => transport()), manager = new ImportManager({ fetch: fetcher, inputReader: new BoundedBinaryReader({ maxBytes: 4 }) })
  const abort = new AbortController(); abort.abort()
  await expect(manager.importUrl('http://localhost/image.png', {}, undefined, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(fetcher).not.toHaveBeenCalled()
  const handler = new Handler(); manager.registerHandler(handler)
  await expect(manager.importUrl('http://localhost/image.png')).rejects.toThrow('byte limit')
  expect(handler.calls).toBe(0)
})

it('bounds outer IO admission, queued cancellation reads nothing, and active cancellation retains capacity', async () => {
  const { BoundedJobQueue } = await import('../../resources/jobs')
  const queue = new BoundedJobQueue({ concurrency: 1, maxQueued: 1 }), entered = gate(), hold = gate()
  const fetcher = vi.fn(async () => transport())
  const manager = new ImportManager({ fetch: fetcher, executor: queue }), abort = new AbortController()
  const handler = new Handler(async () => { entered.release(); await hold.promise }); manager.registerHandler(handler)
  const first = manager.importUrl('http://localhost/first.png', {}, undefined, { signal: abort.signal })
  const firstRejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
  await entered.promise
  const queuedAbort = new AbortController()
  const second = manager.importUrl('http://localhost/second.png', {}, undefined, { signal: queuedAbort.signal })
  const secondRejected = expect(second).rejects.toMatchObject({ name: 'AbortError' })
  await expect(manager.importUrl('http://localhost/denied.png')).rejects.toThrow('queue is full')
  expect(fetcher).toHaveBeenCalledTimes(1)
  queuedAbort.abort(); await secondRejected; abort.abort()
  expect(queue.getSnapshot()).toMatchObject({ active: 1, queued: 0, cancelled: 2, denied: 1 })
  hold.release(); await firstRejected
  expect(queue.getSnapshot().active).toBe(0); await expect(fetch(handler.source)).rejects.toThrow()
})

it('URL and clipboard route within one outer slot without deadlocking a concurrency-one executor', async () => {
  const { BoundedJobQueue } = await import('../../resources/jobs')
  const queue = new BoundedJobQueue({ concurrency: 1, maxQueued: 0 })
  const manager = new ImportManager({ fetch: async () => transport(), executor: queue }), handler = new Handler()
  manager.registerHandler(handler)
  const first = await manager.importUrl('http://localhost/first.png'); releaseImportSources(first)
  const second = await manager.importClipboardItem({ types: ['image/png'], getType: async () => new Blob([bytes]) } as unknown as ClipboardItem)
  expect(handler.calls).toBe(2); expect(queue.getSnapshot()).toMatchObject({ completed: 2, denied: 0, active: 0 })
  releaseImportSources(second!)
})

it('preflight waits before any detection IO and shares the outer job capacity', async () => {
  const { BoundedJobQueue } = await import('../../resources/jobs')
  const queue = new BoundedJobQueue({ concurrency: 1 }), hold = gate(), entered = gate()
  const manager = new ImportManager({ executor: queue }), handler = new Handler(async () => { entered.release(); await hold.promise })
  manager.registerHandler(handler)
  const first = manager.importFileAs(new File([bytes], 'first.png'), 'image/png'); await entered.promise
  const file = new File([bytes], 'queued.png'), slice = vi.spyOn(file, 'slice'), abort = new AbortController()
  const waiting = manager.preflight(file, {}, { signal: abort.signal }), rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
  expect(queue.getSnapshot().queued).toBe(1); expect(slice).not.toHaveBeenCalled()
  abort.abort(); await rejected; expect(slice).not.toHaveBeenCalled()
  hold.release(); releaseImportSources(await first)
})

it('cleans a result when cancellation wins after queue handoff and before final publication', async () => {
  const { BoundedJobQueue } = await import('../../resources/jobs')
  const queue = new BoundedJobQueue(), abort = new AbortController()
  const executor = { submit: async <T>(work: (signal: AbortSignal) => Promise<T> | T, options?: import('../../resources/jobs').JobOptions<T>) => {
    const result = await queue.submit(work, options); abort.abort(); return result
  } }
  const manager = new ImportManager({ executor }), handler = new Handler(), events: string[] = []
  manager.registerHandler(handler); manager.onImportEvent(event => events.push(event.type))
  await expect(manager.importFileAs(new File([bytes], 'image.png'), 'image/png', {}, undefined, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(events).toEqual(['importStart', 'importError']); await expect(fetch(handler.source)).rejects.toThrow()
})

it('deadline includes waiting but never pretends active legacy settlement has completed', async () => {
  vi.useFakeTimers()
  try {
    const { BoundedJobQueue } = await import('../../resources/jobs')
    const queue = new BoundedJobQueue({ concurrency: 1 }), entered = gate(), hold = gate()
    const manager = new ImportManager({ executor: queue, timeoutMs: 100 }), handler = new Handler(async () => { entered.release(); await hold.promise })
    manager.registerHandler(handler)
    const first = manager.importFileAs(new File([bytes], 'image.png'), 'image/png')
    const firstRejected = expect(first).rejects.toMatchObject({ name: 'TimeoutError' }); await entered.promise
    const waiting = manager.canImport(new File([bytes], 'waiting.png'))
    const waitingRejected = expect(waiting).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(101); await waitingRejected
    expect(queue.getSnapshot()).toMatchObject({ active: 1, queued: 0 })
    hold.release(); await firstRejected; expect(queue.getSnapshot().active).toBe(0)
  } finally { vi.useRealTimers() }
})

it('passes a composed live signal into preflight and propagates abort before settlement', async () => {
  let seen: AbortSignal | undefined
  const entered = gate(), hold = gate(), manager = new ImportManager(), abort = new AbortController()
  const handler = new Handler()
  handler.preflight = async (_file?: File, _opts?: unknown, execution?: import('../resources/ImportExecution').ImportExecution): Promise<never> => {
    seen = execution?.signal; entered.release(); await hold.promise; throw new Error('Native settlement')
  }
  manager.registerHandler(handler)
  const pending = manager.preflight(new File([bytes], 'image.png'), {}, { signal: abort.signal })
  const rejected = expect(pending).rejects.toThrow(); await entered.promise
  expect(seen).toBeInstanceOf(AbortSignal); expect(seen!.aborted).toBe(false)
  abort.abort(); expect(seen!.aborted).toBe(true); hold.release(); await rejected
})

it('cancellation from a start observer prevents even a legacy handler from beginning IO', async () => {
  const manager = new ImportManager(), handler = new Handler(), abort = new AbortController()
  manager.registerHandler(handler); manager.onImportEvent(event => { if (event.type === 'importStart') abort.abort() })
  await expect(manager.importFileAs(new File([bytes], 'image.png'), 'image/png', {}, undefined, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(handler.calls).toBe(0)
})

it('late clipboard getType settles in its slot but cannot start a File handler after abort', async () => {
  const { BoundedJobQueue } = await import('../../resources/jobs')
  const queue = new BoundedJobQueue({ concurrency: 1 }), entered = gate(), hold = gate(), abort = new AbortController()
  const manager = new ImportManager({ executor: queue }), handler = new Handler(); manager.registerHandler(handler)
  const item = { types: ['image/png'], getType: async () => { entered.release(); await hold.promise; return new Blob([bytes]) } } as unknown as ClipboardItem
  const pending = manager.importClipboardItem(item, {}, undefined, { signal: abort.signal })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' }); await entered.promise
  abort.abort(); expect(queue.getSnapshot().active).toBe(1); expect(handler.calls).toBe(0)
  hold.release(); await rejected; expect(handler.calls).toBe(0); expect(queue.getSnapshot().active).toBe(0)
})

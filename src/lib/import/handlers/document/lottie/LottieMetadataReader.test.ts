import { expect, it, vi } from 'vitest'
import { LottieMetadataReader } from './LottieMetadataReader'
import { parseLottieMetadata } from './LottieMetadataConverter'
import { LottieDocumentHandler } from '../LottieDocumentHandler'
import { ImportManager } from '../../../ImportManager'
import { ResourceBudget } from '../../../../resources/budget'
import { BoundedBinaryReader } from '../../../../resources/io'
import { ZipReader } from '../../../zip'
import { buildZip } from '../../../zip/__tests__/zipFixtures'
import { releaseImportSources } from '../../../resources/importSources'

const json = JSON.stringify({ v: '5.7', w: 640, h: 360, fr: 30, ip: 10, op: 70, layers: [{ ty: 4 }], assets: [{ id: 'large-not-retained' }] })
const bytes = new TextEncoder().encode(json)

it('preserves JSON and deflated dotLottie metadata while retaining only small scalar fields', async () => {
  const budget = new ResourceBudget({ maxBytes: 65536 }), reader = new LottieMetadataReader({ budget })
  const plain = new File([json], 'animation.json'), archive = new File([await buildZip([{ name: 'manifest.json', data: new Uint8Array() }, { name: 'animations/main.json', data: bytes, deflate: true, descriptor: 'signed' }])], 'animation.lottie')
  const a = await reader.read(plain, 'json'), b = await reader.read(archive, 'dotlottie')
  expect(a).toEqual({ v: '5.7', w: 640, h: 360, fr: 30, durationMs: 2000, layerCount: 1 }); expect(b).toEqual(a)
  expect(a).not.toHaveProperty('layers'); expect(a).not.toHaveProperty('assets')
  expect(budget.getSnapshot().chargedBytes).toBe(0)
  const handler = new LottieDocumentHandler(reader), preflight = await handler.preflight(archive)
  expect(preflight.summary.detectedFeatures).toEqual(['640×360 px', '30 fps', '2.00 s', '1 layer(s)'])
  const result = await handler.handle(archive)
  expect(result.assets[0]).toMatchObject({ width: 640, height: 360, durationMs: 2000, metadata: { notes: 'Lottie v5.7' } })
  expect((await fetch(result.assets[0].url!)).ok).toBe(true)
  expect(budget.getSnapshot().chargedBytes).toBe(0)
  releaseImportSources(result); await Promise.resolve(); await expect(fetch(result.assets[0].url!)).rejects.toThrow()
})

it('rejects text overlap before parsing, malformed archives and input overflow without fallback sources', async () => {
  const budget = new ResourceBudget({ maxBytes: bytes.length * 3 - 1 }), reader = new LottieMetadataReader({ budget })
  await expect(reader.read(new File([bytes], 'a.json'), 'json')).rejects.toThrow('metadata text')
  expect(budget.getSnapshot().chargedBytes).toBe(0); expect(budget.getSnapshot().peakBytes).toBe(bytes.length)
  const handler = new LottieDocumentHandler(reader), create = vi.spyOn(URL, 'createObjectURL')
  try {
    await expect(handler.handle(new File(['PK broken'], 'a.lottie'))).rejects.toThrow('ZIP')
    await expect(new LottieMetadataReader({ maxInputBytes: 1 }).read(new File([bytes], 'a.json'), 'json')).rejects.toThrow('input byte')
    expect(create).not.toHaveBeenCalled()
  } finally { create.mockRestore() }
})

it('does not swallow decoded ZIP limits and releases original file after actual cap rejection', async () => {
  const budget = new ResourceBudget({ maxBytes: 65536 }), zipReader = new ZipReader({ budget, maxEntryBytes: 4 })
  const reader = new LottieMetadataReader({ budget, zipReader })
  const file = new File([await buildZip([{ name: 'animations/a.json', data: new Uint8Array(100), deflate: true, declaredSize: 1 }])], 'a.lottie')
  await expect(reader.read(file, 'dotlottie')).rejects.toThrow('byte limit')
  expect(budget.getSnapshot().chargedBytes).toBe(0); expect(zipReader.getSnapshot().chargedBytes).toBe(0)
})

it('forwards manager preflight/import cancellation to the aware handler and retains live stream charge until native settlement', async () => {
  const budget = new ResourceBudget({ maxBytes: 65536 }), inputReader = new BoundedBinaryReader({ budget, maxBytes: 1024 })
  const waiting = Promise.withResolvers<void>(), cancelled = Promise.withResolvers<void>(), settled = Promise.withResolvers<void>()
  let reads = 0
  const file = new File([bytes], 'a.json')
  vi.spyOn(file, 'stream').mockImplementation(() => new ReadableStream({ pull(c) {
    if (++reads === 1) c.enqueue(bytes.subarray(0, 4)); else waiting.resolve()
  }, cancel() { cancelled.resolve(); return settled.promise } }, { highWaterMark: 0 }))
  const reader = new LottieMetadataReader({ budget, inputReader }), manager = new ImportManager(), abort = new AbortController(), events: string[] = []
  manager.registerHandler(new LottieDocumentHandler(reader)); manager.onImportEvent(e => events.push(e.type))
  const pending = manager.importFileAs(file, 'application/lottie+json', {}, undefined, { signal: abort.signal })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await waiting.promise; abort.abort(); await cancelled.promise
  expect(budget.getSnapshot().chargedBytes).toBe(4)
  settled.resolve(); await rejected
  expect(budget.getSnapshot().chargedBytes).toBe(0); expect(events).toEqual(['importStart', 'importError'])
  const metadata = { read: vi.fn(async () => null) }, preflightManager = new ImportManager()
  preflightManager.registerHandler(new LottieDocumentHandler(metadata))
  const preflightAbort = new AbortController()
  await preflightManager.preflight(new File([json], 'a.json'), {}, { signal: preflightAbort.signal })
  expect(metadata.read).toHaveBeenCalledWith(expect.any(File), 'json', { signal: expect.any(AbortSignal) })
  preflightAbort.abort()
  await expect(preflightManager.preflight(file, {}, { signal: preflightAbort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(metadata.read).toHaveBeenCalledOnce()
})

it('retains nullable metadata for invalid JSON/missing animation, and rejects callback-triggered abort before source creation', async () => {
  const reader = new LottieMetadataReader()
  expect(await reader.read(new File(['{broken'], 'a.json'), 'json')).toBeNull()
  expect(await reader.read(new File([await buildZip([{ name: 'manifest.json', data: bytes }])], 'a.lottie'), 'dotlottie')).toBeNull()
  expect(parseLottieMetadata('[]')).toBeNull(); expect(parseLottieMetadata('{"fr":0,"op":2}')).toMatchObject({ durationMs: 0, layerCount: 0 })
  const abort = new AbortController(), handler = new LottieDocumentHandler(reader), create = vi.spyOn(URL, 'createObjectURL')
  try {
    await expect(handler.handle(new File([json], 'a.json'), {}, p => { if (p.stage === 'converting') abort.abort() }, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(create).not.toHaveBeenCalled()
  } finally { create.mockRestore() }
})

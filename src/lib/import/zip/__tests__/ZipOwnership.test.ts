import { expect, it, vi } from 'vitest'
import { ResourceBudget } from '../../../resources/budget'
import { ZipReader } from '../ZipReader'
import { buildZip } from './zipFixtures'

const data = new Uint8Array([1, 2, 3, 4])

it('keeps exact output admitted until idempotent caller release, independent of archive mutations', async () => {
  const budget = new ResourceBudget({ maxBytes: 100 }), zip = new ZipReader({ budget })
  const buffer = await buildZip([{ name: 'a', data }]), entry = zip.readEntries(buffer)[0]
  const lease = await zip.extractLease(buffer, entry)
  new Uint8Array(buffer).fill(0)
  expect(new Uint8Array(lease.buffer)).toEqual(data); expect(budget.getSnapshot().residentBytes).toBe(4)
  lease.release(); lease.release(); expect(budget.getSnapshot().chargedBytes).toBe(0)
  expect(() => lease.buffer).toThrow('released')
})

it('counts actual inflated output despite dishonest directory size and retains charge until cancellation settles', async () => {
  const buffer = await buildZip([{ name: 'a', data, deflate: true }]), cancelled = Promise.withResolvers<void>(), settled = Promise.withResolvers<void>()
  let reads = 0
  const zip = new ZipReader({ maxEntryBytes: 4, inflater: { decompress() {
    return new ReadableStream({ pull(c) { reads++; c.enqueue(new Uint8Array(3)) }, cancel() { cancelled.resolve(); return settled.promise } }, { highWaterMark: 0 })
  } } })
  const pending = zip.extractLease(buffer, zip.readEntries(buffer)[0]), rejected = expect(pending).rejects.toThrow('byte limit')
  await cancelled.promise
  expect(reads).toBe(2); expect(zip.getSnapshot().chargedBytes).toBe(3)
  settled.resolve(); await rejected; expect(zip.getSnapshot().chargedBytes).toBe(0)
})

it('rejects native actual length mismatch and CRC damage and releases failed output', async () => {
  const zip = new ZipReader()
  const liar = await buildZip([{ name: 'a', data: new Uint8Array(30), deflate: true, declaredSize: 1 }])
  await expect(zip.extractLease(liar, zip.readEntries(liar)[0])).rejects.toThrow('size')
  const bad = await buildZip([{ name: 'a', data }]); new Uint8Array(bad)[31] ^= 1
  await expect(zip.extractLease(bad, zip.readEntries(bad)[0])).rejects.toThrow('CRC')
  expect(zip.getSnapshot().chargedBytes).toBe(0)
})

it('refuses growth/compaction overlap before copying and cleans previous batch entries after failure', async () => {
  const budget = new ResourceBudget({ maxBytes: 21 }), bytes = Uint8Array.from({ length: 10 }, (_, i) => i)
  const buffer = await buildZip([{ name: 'a', data: bytes, deflate: true }])
  const zip = new ZipReader({ budget, maxEntryBytes: 16, inflater: { decompress() {
    let part = 0; const chunks = [bytes.subarray(0, 3), bytes.subarray(3, 6), bytes.subarray(6)]
    return new ReadableStream({ pull(c) { if (part < chunks.length) c.enqueue(chunks[part++]); else c.close() } }, { highWaterMark: 0 })
  } } })
  await expect(zip.extractLease(buffer, zip.readEntries(buffer)[0])).rejects.toThrow('growth')
  expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, peakBytes: 18, denials: 1 })
  const batch = await buildZip([{ name: 'a', data }, { name: 'b', data }]); new Uint8Array(batch)[31 + 4 + 31] ^= 1
  await expect(zip.readAll(batch)).rejects.toThrow('CRC'); expect(budget.getSnapshot().chargedBytes).toBe(0)
})

it('protects callback-scoped output through late abort and cleans callback failures', async () => {
  const buffer = await buildZip([{ name: 'a', data }]), zip = new ZipReader(), entry = zip.readEntries(buffer)[0]
  const started = Promise.withResolvers<void>(), done = Promise.withResolvers<void>(), abort = new AbortController()
  const pending = zip.withEntry(buffer, entry, async bytes => { started.resolve(); await done.promise; return bytes.length }, { signal: abort.signal })
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  await started.promise; abort.abort(); expect(zip.getSnapshot().chargedBytes).toBe(4)
  done.resolve(); await rejected; expect(zip.getSnapshot().chargedBytes).toBe(0)
  await expect(zip.withEntry(buffer, entry, () => { throw new Error('conversion failed') })).rejects.toThrow('conversion failed')
  expect(zip.getSnapshot().chargedBytes).toBe(0)
})

it('pre-abort starts no inflater and unsupported backend errors never fall back', async () => {
  const buffer = await buildZip([{ name: 'a', data, deflate: true }]), decompress = vi.fn((): ReadableStream<Uint8Array> => { throw new Error('No native DEFLATE') })
  const zip = new ZipReader({ inflater: { decompress } }), abort = new AbortController(); abort.abort()
  await expect(zip.extractLease(buffer, zip.readEntries(buffer)[0], { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(decompress).not.toHaveBeenCalled()
  await expect(zip.extractLease(buffer, zip.readEntries(buffer)[0])).rejects.toThrow('No native DEFLATE')
  expect(decompress).toHaveBeenCalledOnce(); expect(zip.getSnapshot().chargedBytes).toBe(0)
})

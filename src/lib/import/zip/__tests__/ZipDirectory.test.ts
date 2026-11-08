import { expect, it } from 'vitest'
import { ZipReader } from '../ZipReader'
import { ZipWriter } from '../../../export/sequence/ZipWriter'
import { buildZip } from './zipFixtures'

const bytes = new TextEncoder().encode('payload')
/** Central offset for complete, known QA archives only; never application input. */
const central = (buffer: ArrayBuffer) => new DataView(buffer).getUint32(buffer.byteLength - 6, true)

it('reads existing ZipWriter archives and both ZIP32 descriptor forms without altering central order', async () => {
  const writer = new ZipWriter(); writer.add('animations/a.json', bytes)
  const stored = await writer.finish().arrayBuffer(), zip = new ZipReader()
  expect(await zip.extract(stored, zip.readEntries(stored)[0])).toEqual(bytes)
  for (const descriptor of ['signed', 'unsigned'] as const) {
    const buffer = await buildZip([{ name: 'b', data: bytes, deflate: true, descriptor }, { name: 'a', data: bytes }])
    expect(zip.readEntries(buffer).map(x => x.name)).toEqual(['b', 'a'])
    expect(await zip.extract(buffer, zip.readEntries(buffer)[0])).toEqual(bytes)
  }
})

it('matches the terminal EOCD comment extent and rejects truncation/trailing garbage', async () => {
  const original = await buildZip([{ name: 'a', data: bytes }]), zip = new ZipReader()
  for (const size of [0, 4, 21, original.byteLength - 1]) expect(() => zip.readEntries(original.slice(0, size))).toThrow(/ZIP/)
  const commented = new Uint8Array(original.byteLength + 30); commented.set(new Uint8Array(original))
  new DataView(commented.buffer).setUint16(original.byteLength - 2, 30, true)
  new DataView(commented.buffer).setUint32(original.byteLength + 1, 0x06054b50, true)
  expect(zip.readEntries(commented.buffer)).toHaveLength(1)
  expect(() => zip.readEntries(commented.buffer.slice(0, -1))).toThrow(/ZIP/)
  expect(zip.readEntries(await buildZip([]))).toEqual([])
})

it('rejects malformed central/local extents, inconsistent identities and incomplete entry lists', async () => {
  const original = await buildZip([{ name: 'a', data: bytes }]), cd = central(original), end = original.byteLength - 22
  const mutations: ((view: DataView) => void)[] = [
    v => v.setUint32(end + 16, 0xfffffff0, true),
    v => v.setUint32(end + 12, 0xffff, true),
    v => v.setUint16(end + 8, 2, true),
    v => v.setUint16(end + 10, 2, true),
    v => v.setUint32(cd, 0, true),
    v => v.setUint16(cd + 28, 0xffff, true),
    v => v.setUint16(cd + 30, 0xffff, true),
    v => v.setUint32(cd + 42, cd, true),
    v => v.setUint32(0, 0, true),
    v => v.setUint16(26, 0xffff, true),
    v => v.setUint8(30, 98),
    v => v.setUint16(8, 8, true),
    v => v.setUint32(18, bytes.length + 1, true),
  ]
  for (const mutate of mutations) {
    const buffer = original.slice(0); mutate(new DataView(buffer))
    expect(() => new ZipReader().readEntries(buffer)).toThrow(/ZIP/)
  }
})

it('rejects duplicate/unsafe paths, overlapping local records and unsupported capabilities explicitly', async () => {
  for (const name of ['../a', '/a', 'C:a', 'a\\b', 'a/./b', 'a\u0000b', '']) {
    await expect(Promise.resolve().then(async () => new ZipReader().readEntries(await buildZip([{ name, data: bytes }])))).rejects.toThrow(/ZIP/)
  }
  const duplicate = await buildZip([{ name: 'a', data: bytes }, { name: 'a', data: bytes }])
  expect(() => new ZipReader().readEntries(duplicate)).toThrow('Duplicate')
  const original = await buildZip([{ name: 'a', data: bytes }]), cd = central(original), end = original.byteLength - 22
  const mutations: [string, (view: DataView) => void][] = [
    ['ZIP64', v => v.setUint16(end + 10, 0xffff, true)],
    ['ZIP64', v => v.setUint32(cd + 24, 0xffffffff, true)],
    ['Split', v => v.setUint16(end + 4, 1, true)],
    ['Split', v => v.setUint16(cd + 34, 1, true)],
    ['flags', v => v.setUint16(cd + 8, 1, true)],
    ['method', v => v.setUint16(cd + 10, 12, true)],
    ['newer', v => v.setUint16(cd + 6, 45, true)],
  ]
  for (const [message, mutate] of mutations) {
    const buffer = original.slice(0); mutate(new DataView(buffer))
    expect(() => new ZipReader().readEntries(buffer)).toThrow(message)
  }
  // A matching inner local header lies INSIDE another entry's payload. Local
  // name/CRC/size agreement alone is insufficient to establish disjoint ranges.
  const inner = await buildZip([{ name: 'b', data: bytes }])
  const nested = new Uint8Array(inner.slice(0, central(inner)))
  const overlap = await buildZip([{ name: 'a', data: nested }, { name: 'b', data: bytes }]), v = new DataView(overlap)
  v.setUint32(central(overlap) + 47 + 42, 31, true)
  expect(() => new ZipReader().readEntries(overlap)).toThrow('Overlapping')
})

it('validates entry count, archive, declared per-entry and aggregate caps before decoding', async () => {
  const buffer = await buildZip([{ name: 'a', data: bytes }, { name: 'b', data: bytes }])
  for (const options of [{ maxArchiveBytes: buffer.byteLength - 1 }, { maxEntryBytes: bytes.length - 1 }, { maxTotalBytes: bytes.length * 2 - 1 }, { maxEntries: 1 }]) {
    const zip = new ZipReader(options)
    expect(() => zip.readEntries(buffer)).toThrow(/limit/); expect(zip.getSnapshot().peakBytes).toBe(0)
  }
  for (const options of [{ maxEntries: 0 }, { maxEntries: 65535 }, { maxArchiveBytes: Infinity }, { maxEntryBytes: NaN }, { maxTotalBytes: -1 }]) expect(() => new ZipReader(options)).toThrow(RangeError)
})

it('rejects damaged data descriptors and forged descriptors instead of reading arbitrary ranges', async () => {
  const buffer = await buildZip([{ name: 'a', data: bytes, descriptor: 'signed' }]), zip = new ZipReader(), entry = zip.readEntries(buffer)[0]
  await expect(zip.extractLease(buffer, { ...entry, compressedSize: 1 })).rejects.toThrow('descriptor')
  const damaged = buffer.slice(0); new DataView(damaged).setUint32(31 + bytes.length + 4, 0, true)
  expect(() => zip.readEntries(damaged)).toThrow('descriptor')
})

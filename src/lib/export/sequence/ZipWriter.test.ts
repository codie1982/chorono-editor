import { describe, it, expect } from 'vitest'
import { ZipWriter, crc32 } from './ZipWriter'

const enc = new TextEncoder()

describe('crc32', () => {
  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('matches known IEEE CRC-32 vectors', () => {
    expect(crc32(enc.encode('hello'))).toBe(0x3610a686)
    expect(crc32(enc.encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })

  it('returns an unsigned 32-bit value', () => {
    const c = crc32(enc.encode('\xff\xff\xff\xff'))
    expect(c).toBeGreaterThanOrEqual(0)
    expect(c).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('ZipWriter — STORE archive structure', () => {
  async function bytesOf(blob: Blob): Promise<DataView> {
    return new DataView(await blob.arrayBuffer())
  }

  it('produces a ZIP whose Content-Type is application/zip', () => {
    const zip = new ZipWriter()
    zip.add('a.txt', enc.encode('hi'))
    expect(zip.finish().type).toBe('application/zip')
  })

  it('starts with the local file header signature', async () => {
    const zip = new ZipWriter()
    zip.add('a.txt', enc.encode('hi'))
    const dv = await bytesOf(zip.finish())
    expect(dv.getUint32(0, true)).toBe(0x04034b50)
  })

  it('ends with an EOCD record reporting the entry count', async () => {
    const zip = new ZipWriter()
    zip.add('a.txt', enc.encode('hi'))
    zip.add('b.txt', enc.encode('world'))
    const dv = await bytesOf(zip.finish())
    const eocd = dv.byteLength - 22 // no archive comment
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50)
    expect(dv.getUint16(eocd + 8, true)).toBe(2)  // entries this disk
    expect(dv.getUint16(eocd + 10, true)).toBe(2) // total entries
  })

  it('stores method 0 (no compression) with matching sizes', async () => {
    const data = enc.encode('uncompressed payload')
    const zip = new ZipWriter()
    zip.add('a.txt', data)
    const dv = await bytesOf(zip.finish())
    expect(dv.getUint16(8, true)).toBe(0)                  // compression method = store
    expect(dv.getUint32(18, true)).toBe(data.length)       // compressed size
    expect(dv.getUint32(22, true)).toBe(data.length)       // uncompressed size
    expect(dv.getUint32(14, true)).toBe(crc32(data))       // crc in local header
  })

  it('records the filename in the local header', async () => {
    const zip = new ZipWriter()
    zip.add('frame_0001.png', enc.encode('x'))
    const dv = await bytesOf(zip.finish())
    const nameLen = dv.getUint16(26, true)
    expect(nameLen).toBe('frame_0001.png'.length)
    let name = ''
    for (let i = 0; i < nameLen; i++) name += String.fromCharCode(dv.getUint8(30 + i))
    expect(name).toBe('frame_0001.png')
  })

  it('central directory offset points at the EOCD-declared location', async () => {
    const zip = new ZipWriter()
    zip.add('a.txt', enc.encode('hi'))
    const dv = await bytesOf(zip.finish())
    const eocd = dv.byteLength - 22
    const cdOffset = dv.getUint32(eocd + 16, true)
    expect(dv.getUint32(cdOffset, true)).toBe(0x02014b50) // central dir signature
  })
})

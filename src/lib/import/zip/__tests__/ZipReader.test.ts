import { describe, it, expect } from 'vitest'
import { ZipReader } from '../ZipReader'

// ── Minimal ZIP builder (stored or deflate) for tests ───────────────────────────

async function buildZip(files: { name: string; data: Uint8Array; deflate?: boolean }[]): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const name = enc.encode(f.name)
    let stored = f.data
    let method = 0
    if (f.deflate) {
      const cs = new CompressionStream('deflate-raw')
      const buf = await new Response(new Blob([f.data as BlobPart]).stream().pipeThrough(cs)).arrayBuffer()
      stored = new Uint8Array(buf)
      method = 8
    }
    const lh = new Uint8Array(30 + name.length)
    const lv = new DataView(lh.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(8, method, true)
    lv.setUint32(18, stored.length, true)
    lv.setUint32(22, f.data.length, true)
    lv.setUint16(26, name.length, true)
    lh.set(name, 30)
    local.push(lh, stored)

    const ch = new Uint8Array(46 + name.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(10, method, true)
    cv.setUint32(20, stored.length, true)
    cv.setUint32(24, f.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    ch.set(name, 46)
    central.push(ch)
    offset += lh.length + stored.length
  }

  const cdStart = offset
  const cdSize = central.reduce((s, c) => s + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdStart, true)

  const all = [...local, ...central, eocd]
  const total = all.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const a of all) { out.set(a, p); p += a.length }
  return out.buffer
}

const text = (s: string) => new TextEncoder().encode(s)
const str  = (u: Uint8Array) => new TextDecoder().decode(u)

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('ZipReader', () => {
  const zip = new ZipReader()

  it('throws on a non-ZIP buffer', () => {
    expect(() => zip.readEntries(text('not a zip at all').buffer)).toThrow(/ZIP/)
  })

  it('reads central-directory entries (stored)', async () => {
    const buf = await buildZip([
      { name: 'manifest.json', data: text('{"v":1}') },
      { name: 'animations/a.json', data: text('{"layers":[]}') },
    ])
    const entries = zip.readEntries(buf)
    expect(entries.map(e => e.name)).toEqual(['manifest.json', 'animations/a.json'])
    expect(entries[0].method).toBe(0)
    expect(entries[1].uncompressedSize).toBe(text('{"layers":[]}').length)
  })

  it('extracts a stored entry', async () => {
    const buf = await buildZip([{ name: 'manifest.json', data: text('{"hello":true}') }])
    const entries = zip.readEntries(buf)
    const data = await zip.extract(buf, entries[0])
    expect(str(data)).toBe('{"hello":true}')
  })

  it('inflates a deflate entry (round-trip)', async () => {
    const payload = JSON.stringify({ v: '5.7', layers: new Array(50).fill({ ty: 4 }) })
    const buf = await buildZip([{ name: 'animations/main.json', data: text(payload), deflate: true }])
    const entries = zip.readEntries(buf)
    expect(entries[0].method).toBe(8)
    const data = await zip.extract(buf, entries[0])
    expect(str(data)).toBe(payload)
  })

  it('readAll returns a name→bytes map and skips directories', async () => {
    const buf = await buildZip([
      { name: 'manifest.json', data: text('m'), deflate: true },
      { name: 'images/', data: text('') },
      { name: 'images/x.png', data: text('PNGDATA') },
    ])
    const map = await zip.readAll(buf)
    expect(Array.from(map.keys()).sort()).toEqual(['images/x.png', 'manifest.json'])
    expect(str(map.get('images/x.png')!)).toBe('PNGDATA')
  })
})

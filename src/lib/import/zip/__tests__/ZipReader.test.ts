import { describe, it, expect } from 'vitest'
import { ZipReader } from '../ZipReader'

import { buildZip } from './zipFixtures'

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

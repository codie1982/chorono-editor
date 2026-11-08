import { crc32 } from '../../../format/checksum'

/** Small known-size QA fixture producer, never application IO. Native compression
 * verifies both stored/deflate ZIP32 and optional descriptors independently of
 * the production parser. Callers use small literal payloads only. */

export async function buildZip(files: { name: string; data: Uint8Array; deflate?: boolean; descriptor?: 'signed' | 'unsigned'; declaredSize?: number }[]): Promise<ArrayBuffer> {
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
    lv.setUint16(6, f.descriptor ? 8 : 0, true)
    lv.setUint16(8, method, true)
    lv.setUint32(14, f.descriptor ? 0 : crc32(f.data), true)
    lv.setUint32(18, f.descriptor ? 0 : stored.length, true)
    lv.setUint32(22, f.descriptor ? 0 : (f.declaredSize ?? f.data.length), true)
    lv.setUint16(26, name.length, true)
    lh.set(name, 30)
    let descriptor = new Uint8Array(0)
    if (f.descriptor) {
      descriptor = new Uint8Array(f.descriptor === 'signed' ? 16 : 12)
      const dv = new DataView(descriptor.buffer), p = f.descriptor === 'signed' ? 4 : 0
      if (p) dv.setUint32(0, 0x08074b50, true)
      dv.setUint32(p, crc32(f.data), true); dv.setUint32(p + 4, stored.length, true); dv.setUint32(p + 8, f.declaredSize ?? f.data.length, true)
    }
    local.push(lh, stored, descriptor)

    const ch = new Uint8Array(46 + name.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(8, f.descriptor ? 8 : 0, true)
    cv.setUint16(10, method, true)
    cv.setUint32(16, crc32(f.data), true)
    cv.setUint32(20, stored.length, true)
    cv.setUint32(24, f.declaredSize ?? f.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    ch.set(name, 46)
    central.push(ch)
    offset += lh.length + stored.length + descriptor.length
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


import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {readFontMetadata,fontPolicyBytes} from './readFontMetadata'

/** Synthetic container-only data. No glyph decoder is invoked on these bytes. */
function sfnt(){const bytes=new Uint8Array(32),view=new DataView(bytes.buffer)
  view.setUint32(0,0x00010000);view.setUint16(4,1);view.setUint32(20,28);view.setUint32(24,4);return bytes}
function woff(original=4){const bytes=new Uint8Array(68),view=new DataView(bytes.buffer)
  view.setUint32(0,0x774f4646);view.setUint32(8,68);view.setUint16(12,1);view.setUint32(16,28+Math.ceil(original/4)*4)
  view.setUint32(48,64);view.setUint32(52,4);view.setUint32(56,original);return bytes}

describe('font container preflight',()=>{
  it('reads the shipped real WOFF and keeps encoded bytes separate from reconstructed tables',()=>{
    const bytes=readFileSync('public/fonts/GeistVF.woff'),metadata=readFontMetadata(bytes)
    expect(metadata).toMatchObject({format:'woff',encodedBytes:bytes.byteLength})
    expect(metadata.sfntReferenceBytes).toBeGreaterThan(bytes.byteLength)
    expect(fontPolicyBytes(metadata)).toBe(Math.max(1024**2,bytes.byteLength*8,metadata.sfntReferenceBytes))
  })
  it('validates actual SFNT directory/table bounds through offset views',()=>{
    const source=sfnt(),padded=new Uint8Array(40);padded.set(source,4)
    expect(readFontMetadata(padded.subarray(4,36))).toEqual({format:'sfnt',encodedBytes:32,sfntReferenceBytes:32})
    new DataView(source.buffer).setUint32(24,5)
    expect(()=>readFontMetadata(source)).toThrow('bounds')
  })
  it('rejects invalid/empty table directories without allocating tables',()=>{
    const bytes=sfnt(),view=new DataView(bytes.buffer)
    view.setUint16(4,0);expect(()=>readFontMetadata(bytes)).toThrow('directory')
    view.setUint16(4,65535);expect(()=>readFontMetadata(bytes)).toThrow('directory')
    expect(()=>readFontMetadata(new Uint8Array(3))).toThrow('Truncated')
    expect(()=>readFontMetadata(new Uint8Array(48))).toThrow('Unsupported')
  })
  it('uses WOFF original sizes before decompression and validates reconstructed totals',()=>{
    expect(readFontMetadata(woff(16*1024**2))).toMatchObject({encodedBytes:68,sfntReferenceBytes:16*1024**2+28})
    const bytes=woff(),view=new DataView(bytes.buffer);view.setUint32(16,100)
    expect(()=>readFontMetadata(bytes)).toThrow('reconstructed')
    view.setUint32(16,32);view.setUint32(52,5)
    expect(()=>readFontMetadata(bytes)).toThrow('bounds')
  })
  it('never treats WOFF2 reference size as a reconstructed-byte guarantee',()=>{
    const bytes=new Uint8Array(48),view=new DataView(bytes.buffer)
    view.setUint32(0,0x774f4632);view.setUint32(8,48);view.setUint16(12,1);view.setUint32(16,20*1024**2)
    const metadata=readFontMetadata(bytes)
    expect(metadata).toMatchObject({format:'woff2',sfntReferenceBytes:20*1024**2})
    expect(fontPolicyBytes(metadata)).toBe(20*1024**2)
    view.setUint32(20,1);expect(()=>readFontMetadata(bytes)).toThrow('compressed stream')
  })
})

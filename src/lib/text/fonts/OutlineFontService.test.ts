import {readFileSync} from 'node:fs'
import {describe,expect,it,vi} from 'vitest'
import type {Font} from 'opentype.js'
import {OutlineFontService} from './OutlineFontService'
import {FontBinaryReader,type FontBinarySource} from '../../asset/fonts/input'
import {BoundedBinaryReader} from '../../resources/io'
import {ResourceBudget} from '../../resources/budget'

const MiB=1024**2
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
/** Minimal parser output is sufficient for cache/lifetime tests; real shipped
 * WOFF parsing is independently exercised below with the installed parser. */
const font=(unitsPerEm:number)=>({unitsPerEm} as Font)
function source(budget:ResourceBudget,reference=32):FontBinarySource {
  const reader=new BoundedBinaryReader({budget,maxBytes:128})
  return {readUrl:async()=>({input:await reader.readResponse(new Response(new Uint8Array(32))),
    metadata:{format:'sfnt',encodedBytes:32,sfntReferenceBytes:reference}})}
}

describe('parsed outline font ownership',()=>{
  it('parses the shipped real WOFF with lazy glyphs while retaining encoded backing only until idle cleanup',async()=>{
    const bytes=readFileSync('public/fonts/GeistVF.woff'),budget=new ResourceBudget({maxBytes:16*MiB})
    const service=new OutlineFontService({budget,inputSource:new FontBinaryReader({budget,fetch:async()=>new Response(bytes)})})
    const result=await service.withFont('geist',font=>({units:font.unitsPerEm,commands:font.stringToGlyphs('AB')[0].getPath(0,0,48).commands.length}))
    expect(result.units).toBeGreaterThan(0);expect(result.commands).toBeGreaterThan(0)
    expect(budget.getSnapshot().categories.input.residentBytes).toBe(bytes.byteLength)
    service.clearIdle();expect(budget.getSnapshot().chargedBytes).toBe(0);service.dispose()
  })
  it('deduplicates one URL but never reuses a different source font',async()=>{
    const budget=new ResourceBudget({maxBytes:8*MiB}),parse=vi.fn().mockReturnValueOnce(font(1000)).mockReturnValueOnce(font(2000))
    const service=new OutlineFontService({budget,inputSource:source(budget),parse})
    expect(await Promise.all([service.withFont('a',f=>f.unitsPerEm),service.withFont('a',f=>f.unitsPerEm)])).toEqual([1000,1000])
    expect(await service.withFont('b',f=>f.unitsPerEm)).toBe(2000);expect(parse).toHaveBeenCalledTimes(2)
    service.dispose();expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
  it('retries failed parsing instead of caching a rejected promise or retaining bytes',async()=>{
    const budget=new ResourceBudget({maxBytes:4*MiB}),parse=vi.fn().mockImplementationOnce(()=>{throw new Error('bad glyph table')}).mockReturnValue(font(1000))
    const service=new OutlineFontService({budget,inputSource:source(budget),parse})
    await expect(service.withFont('same',f=>f.unitsPerEm)).rejects.toThrow('bad glyph')
    expect(budget.getSnapshot().chargedBytes).toBe(0)
    expect(await service.withFont('same',f=>f.unitsPerEm)).toBe(1000);expect(parse).toHaveBeenCalledTimes(2);service.dispose()
  })
  it('denies expanded parsed policy before invoking the parser and releases encoded backing',async()=>{
    const budget=new ResourceBudget({maxBytes:2*MiB}),parse=vi.fn(),service=new OutlineFontService({budget,inputSource:source(budget,MiB),parse})
    await expect(service.withFont('huge',f=>f.unitsPerEm)).rejects.toThrow('budget')
    expect(parse).not.toHaveBeenCalled();expect(budget.getSnapshot().chargedBytes).toBe(0);service.dispose()
  })
  it('preserves live conversion pins during clear and rejects stale callback output after document cancellation',async()=>{
    const budget=new ResourceBudget({maxBytes:4*MiB}),gate=deferred<void>(),started=deferred<void>(),abort=new AbortController()
    const service=new OutlineFontService({budget,inputSource:source(budget),parse:()=>font(1000)})
    const pending=service.withFont('a',async f=>{started.resolve();await gate.promise;return f.unitsPerEm},{signal:abort.signal})
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await started.promise;service.clear();service.clearIdle();abort.abort()
    expect(budget.getSnapshot().chargedBytes).toBe(MiB+32)
    gate.resolve();await rejected;expect(budget.getSnapshot().chargedBytes).toBe(0);service.dispose()
  })
})

import {readFileSync} from 'node:fs'
import {describe,expect,it,vi} from 'vitest'
import {FontBinaryReader} from './FontBinaryReader'
import {ResourceBudget} from '../../../resources/budget'

describe('bounded font binary ownership',()=>{
  it('preserves the native platform fetch receiver',async()=>{
    const original=globalThis.fetch,bytes=readFileSync('public/fonts/GeistVF.woff')
    vi.stubGlobal('fetch',function(this:typeof globalThis){expect(this).toBe(globalThis);return Promise.resolve(new Response(bytes))})
    try{
      const first=await new FontBinaryReader().readUrl('font');first.input.release()
      const injected=await new FontBinaryReader({fetch:globalThis.fetch}).readUrl('font');injected.input.release()
    }
    finally{vi.stubGlobal('fetch',original);vi.unstubAllGlobals()}
  })
  it('hands off real encoded backing with actual metadata and releases exactly once',async()=>{
    const bytes=readFileSync('public/fonts/GeistVF.woff'),budget=new ResourceBudget({maxBytes:8*1024**2})
    const reader=new FontBinaryReader({budget,fetch:async()=>new Response(bytes)})
    const {input,metadata}=await reader.readUrl('font')
    expect(metadata.encodedBytes).toBe(bytes.byteLength);expect(input.byteLength).toBe(bytes.byteLength)
    expect(budget.getSnapshot().chargedBytes).toBe(bytes.byteLength)
    input.release();input.release();expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
  it('refuses dishonest size/actual overflow and malformed containers without retaining input',async()=>{
    const budget=new ResourceBudget({maxBytes:128}),reader=new FontBinaryReader({budget,maxBytes:32,
      fetch:async()=>new Response(new Uint8Array(33),{headers:{'content-length':'1'}})})
    await expect(reader.readUrl('large')).rejects.toThrow('byte limit');expect(budget.getSnapshot().chargedBytes).toBe(0)
    const malformed=new FontBinaryReader({budget,fetch:async()=>new Response(new Uint8Array(24))})
    await expect(malformed.readUrl('bad')).rejects.toThrow('signature');expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
  it('does not fetch a pre-aborted font or swallow a transport failure',async()=>{
    const abort=new AbortController();abort.abort()
    const fetcher=vi.fn<typeof fetch>(async()=>{throw new Error('font network failed')}),reader=new FontBinaryReader({fetch:fetcher})
    await expect(reader.readUrl('font',abort.signal)).rejects.toMatchObject({name:'AbortError'});expect(fetcher).not.toHaveBeenCalled()
    await expect(reader.readUrl('font')).rejects.toThrow('network failed')
  })
})

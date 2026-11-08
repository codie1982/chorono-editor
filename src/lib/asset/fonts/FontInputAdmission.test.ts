import {describe,expect,it,vi} from 'vitest'
import {FontAssetService} from './FontAssetService'
import {BoundedBinaryReader} from '../../resources/io'
import {ResourceBudget} from '../../resources/budget'
import type {FontBinarySource} from './input'
import type {Asset} from '../../types'

const MiB=1024**2
const asset:Asset={id:'font',name:'font',type:'font',url:'font',metadata:{notes:'family: Brand',filesize:1}}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
/** Input port uses the real bounded reader/ledger; supplied scalar table facts
 * isolate native-admission tests from container parsing, tested separately. */
function source(budget:ResourceBudget,reference=32):FontBinarySource {
  const reader=new BoundedBinaryReader({budget,maxBytes:128})
  return {readUrl:async()=>({input:await reader.readResponse(new Response(new Uint8Array(32))),
    metadata:{format:'sfnt',encodedBytes:32,sfntReferenceBytes:reference}})}
}

describe('native font binary admission',()=>{
  it('borrows admitted binary data instead of fetching again and retains backing through final pin cleanup',async()=>{
    const budget=new ResourceBudget({maxBytes:2*MiB}),dispose=vi.fn()
    const service=new FontAssetService({budget,inputSource:source(budget),decoder:input=>{
      expect(input.data?.byteLength).toBe(32)
      expect(budget.getSnapshot().chargedBytes).toBe(MiB+32)
      return {alias:input.alias,ready:Promise.resolve(),dispose}
    }})
    const pin=await service.acquire(asset)
    expect(budget.getSnapshot().categories.input.residentBytes).toBe(32)
    service.clear();expect(dispose).not.toHaveBeenCalled()
    pin.release();expect(dispose).toHaveBeenCalledOnce();expect(budget.getSnapshot().chargedBytes).toBe(0);service.dispose()
  })
  it('denies expanded table-policy overflow before calling FontFace and rolls back encoded bytes',async()=>{
    const budget=new ResourceBudget({maxBytes:2*MiB}),decoder=vi.fn()
    const service=new FontAssetService({budget,inputSource:source(budget,4*MiB),decoder})
    await expect(service.acquire(asset)).rejects.toThrow('budget')
    expect(decoder).not.toHaveBeenCalled();expect(budget.getSnapshot().chargedBytes).toBe(0);service.dispose()
  })
  it('keeps encoded backing charged after consumer cancellation until actual native settlement',async()=>{
    const budget=new ResourceBudget({maxBytes:2*MiB}),gate=deferred<void>(),started=deferred<void>(),abort=new AbortController(),dispose=vi.fn()
    const service=new FontAssetService({budget,inputSource:source(budget),decoder:input=>{
      started.resolve();return {alias:input.alias,ready:gate.promise,dispose}
    }})
    const pending=service.acquire(asset,{signal:abort.signal}),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await started.promise;abort.abort();await rejected
    expect(budget.getSnapshot().chargedBytes).toBe(MiB+32);expect(dispose).not.toHaveBeenCalled()
    gate.resolve();await vi.waitFor(()=>expect(service.getSnapshot().preparation.active).toBe(0))
    expect(dispose).toHaveBeenCalledOnce();expect(budget.getSnapshot().chargedBytes).toBe(0);service.dispose()
  })
  it('quarantines both native and encoded owners if native deletion fails, then retries explicitly',async()=>{
    const budget=new ResourceBudget({maxBytes:2*MiB}),dispose=vi.fn().mockImplementationOnce(()=>{throw new Error('delete failed')})
    const service=new FontAssetService({budget,inputSource:source(budget),decoder:input=>({alias:input.alias,ready:Promise.resolve(),dispose})})
    const pin=await service.acquire(asset);service.clear();pin.release()
    expect(service.getSnapshot().residency.failedEntries).toBe(1)
    expect(budget.getSnapshot().chargedBytes).toBe(MiB+32)
    service.clearIdle();expect(dispose).toHaveBeenCalledTimes(2);expect(budget.getSnapshot().chargedBytes).toBe(0);service.dispose()
  })
})

import {describe,expect,it,vi} from 'vitest'
import {FontAssetService} from './FontAssetService'
import type {FontResource} from './types'
import type {Asset} from '../../types'
import {ResourceBudget} from '../../resources/budget'
import {assetSourcePool} from '../sources'

const MiB=1024**2
const asset=(url:string,family='Brand'):Asset=>({id:url,name:url,type:'font',url,metadata:{notes:`family: ${family}`,filesize:1000}})
/** Native load settlement is controlled here; browser QA separately loads real WOFF files. */
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
function resource(alias:string,ready=Promise.resolve()):FontResource{return {alias,ready,dispose:vi.fn()}}

describe('font ownership and admission',()=>{
  it('deduplicates source aliases, scopes different files, and preserves independently pinned retired faces',async()=>{
    const decoder=vi.fn(({alias}:{alias:string})=>resource(alias)),budget=new ResourceBudget({maxBytes:4*MiB})
    const service=new FontAssetService({decoder,budget,maxBytes:4*MiB})
    const [a,b]=await Promise.all([service.acquire(asset('same')),service.acquire({...asset('same'),id:'alias'})])
    expect(a.value).toBe(b.value);expect(decoder).toHaveBeenCalledOnce()
    const c=await service.acquire(asset('other'));expect(c.value.alias).not.toBe(a.value.alias)
    expect(service.getSnapshot().residency.residentBytes).toBe(2*MiB)
    service.clear();a.release();service.clearIdle();expect(b.value.dispose).not.toHaveBeenCalled()
    const retained=b.value;b.release();expect(retained.dispose).toHaveBeenCalledOnce()
    c.release();service.dispose();expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
  it('denies local/global overflow before native construction, using a policy charge instead of source bytes',async()=>{
    const decoder=vi.fn(({alias}:{alias:string})=>resource(alias)),budget=new ResourceBudget({maxBytes:MiB-1})
    const service=new FontAssetService({decoder,budget})
    await expect(service.acquire(asset('tiny'))).rejects.toThrow('budget');expect(decoder).not.toHaveBeenCalled()
    expect(budget.getSnapshot().chargedBytes).toBe(0);service.dispose()
    const local=new FontAssetService({decoder,maxBytes:MiB-1})
    await expect(local.acquire(asset('tiny'))).rejects.toThrow('budget');expect(decoder).not.toHaveBeenCalled();local.dispose()
    const unknown=new FontAssetService({decoder,maxBytes:4*MiB})
    const pin=await unknown.acquire({...asset('unknown'),metadata:{notes:'family: Brand'}})
    expect(unknown.getSnapshot().residency.protectedBytes).toBe(4*MiB);pin.release();unknown.dispose()
  })
  it('keeps native slots, reservations and original input alive after consumer cancellation',async()=>{
    const source=assetSourcePool.create(new Blob(['font source'])),gate=deferred<void>(),started=deferred<void>()
    const old=resource('old',gate.promise),fresh=resource('fresh'),decoder=vi.fn(()=>old).mockReturnValueOnce(old).mockReturnValue(fresh)
    const service=new FontAssetService({decoder:input=>{started.resolve();return decoder()},maxConcurrent:1})
    const abort=new AbortController(),pending=service.acquire(asset(source.url),{signal:abort.signal})
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await started.promise;abort.abort();source.release();await rejected
    expect((await fetch(source.url)).ok).toBe(true)
    const next=service.acquire(asset(source.url))
    expect(service.getSnapshot()).toMatchObject({preparation:{active:1,queued:1},residency:{reservedBytes:MiB}})
    gate.resolve();const pin=await next
    expect(old.dispose).toHaveBeenCalledOnce();expect(pin.value).toBe(fresh)
    await expect(fetch(source.url)).rejects.toThrow();pin.release();service.dispose()
  })
  it('times out a consumer without declaring its non-abortable native load complete',async()=>{
    vi.useFakeTimers()
    try{
      const gate=deferred<void>(),started=deferred<void>(),native=resource('late',gate.promise)
      const service=new FontAssetService({timeoutMs:25,decoder:()=>{started.resolve();return native}})
      const promise=service.acquire(asset('slow')),rejected=expect(promise).rejects.toMatchObject({name:'TimeoutError'})
      await started.promise;await vi.advanceTimersByTimeAsync(25);await rejected
      expect(service.getSnapshot()).toMatchObject({preparation:{active:1},residency:{reservedBytes:MiB}})
      gate.resolve();await vi.waitFor(()=>expect(service.getSnapshot().preparation.active).toBe(0))
      expect(native.dispose).toHaveBeenCalledOnce();expect(service.getSnapshot().residency.chargedBytes).toBe(0);service.dispose()
    }finally{vi.useRealTimers()}
  })
  it('cancels one shared caller independently and keeps the surviving caller ready',async()=>{
    const gate=deferred<void>(),started=deferred<void>(),native=resource('shared',gate.promise)
    const decoder=vi.fn(()=>{started.resolve();return native}),service=new FontAssetService({decoder}),abort=new AbortController()
    const a=service.acquire(asset('same'),{signal:abort.signal}),b=service.acquire(asset('same'))
    const rejected=expect(a).rejects.toMatchObject({name:'AbortError'});await started.promise;abort.abort();await rejected
    gate.resolve();const pin=await b;expect(pin.value).toBe(native);expect(decoder).toHaveBeenCalledOnce()
    pin.release();service.dispose()
  })
  it('retires pending generations, uses finite idle grace and retries failed native cleanup explicitly',async()=>{
    vi.useFakeTimers()
    try{
      const gate=deferred<void>(),started=deferred<void>(),native=resource('old',gate.promise)
      const service=new FontAssetService({decoder:()=>{started.resolve();return native}})
      const old=service.acquire(asset('old'));await started.promise;service.clear();gate.resolve();const pin=await old
      expect(service.peekAlias(asset('old'))).toBeUndefined();expect(service.getSnapshot().residency.retiredEntries).toBe(1)
      pin.release();expect(native.dispose).toHaveBeenCalledOnce();service.dispose()
      const disposable=resource('warm'),warm=new FontAssetService({decoder:()=>disposable})
      const p=await warm.acquire(asset('warm'));p.release();vi.advanceTimersByTime(1999)
      expect(warm.getSnapshot().residency.chargedBytes).toBe(MiB)
      vi.mocked(disposable.dispose).mockImplementationOnce(()=>{throw new Error('native busy')})
      vi.advanceTimersByTime(1);expect(warm.getSnapshot().residency).toMatchObject({failedEntries:1,chargedBytes:MiB})
      warm.clearIdle();expect(warm.getSnapshot().residency.chargedBytes).toBe(0);warm.dispose()
    }finally{vi.useRealTimers()}
  })
  it('cleans failed loads and bounds queued records without constructing more native fonts',async()=>{
    const gate=deferred<void>(),started=deferred<void>(),native=resource('blocked',gate.promise)
    const decoder=vi.fn(()=>{started.resolve();return native}),service=new FontAssetService({decoder,maxConcurrent:1,maxQueued:1})
    const a=service.acquire(asset('a')),b=service.acquire(asset('b'))
    const failures=[expect(a).rejects.toThrow('disposed'),expect(b).rejects.toThrow('disposed')]
    await started.promise;await expect(service.acquire(asset('full'))).rejects.toThrow('full')
    service.dispose();gate.resolve();await Promise.all(failures)
    expect(decoder).toHaveBeenCalledOnce();expect(service.getSnapshot().residency.chargedBytes).toBe(0)
    const failed=resource('bad',Promise.reject(new Error('bad font'))),bad=new FontAssetService({decoder:()=>failed})
    await expect(bad.acquire(asset('bad'))).rejects.toThrow('bad font')
    expect(failed.dispose).toHaveBeenCalledOnce();expect(bad.getSnapshot().residency.chargedBytes).toBe(0);bad.dispose()
  })
  it('uses unique runtime aliases across independent service instances',async()=>{
    const decoder=({alias}:{alias:string})=>resource(alias),a=new FontAssetService({decoder}),b=new FontAssetService({decoder})
    const x=await a.acquire(asset('same')),y=await b.acquire(asset('same'))
    expect(x.value.alias).not.toBe(y.value.alias);x.release();y.release();a.dispose();b.dispose()
  })
})

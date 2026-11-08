import {describe,expect,it,vi} from 'vitest'
import {OutputResources} from './OutputResources'
import {OutputScope} from './OutputScope'
import {ResourceBudget} from '../../resources/budget'

/** Explicit native completion gate; no timer claims unfinished work is stopped. */
function gate<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}

describe('bounded output ownership',()=>{
  it('admits before creating values, pins independent result consumers, and cleans only after final release',async()=>{
    const budget=new ResourceBudget({maxBytes:64}),owner=new OutputResources({budget,maxBytes:64}),dispose=vi.fn()
    const result=await owner.run(async scope=>{
      const value=scope.own(32,()=>{expect(budget.getSnapshot().chargedBytes).toBe(33);return {bytes:32}},dispose)
      return value.value
    })
    const other=result.retain();result.release()
    expect(other.value.bytes).toBe(32);expect(dispose).not.toHaveBeenCalled();expect(()=>result.value).toThrow('released')
    other.release();other.release();expect(dispose).toHaveBeenCalledOnce();expect(budget.getSnapshot().chargedBytes).toBe(0);owner.dispose()
  })
  it('refuses native allocation without host capacity and cleans earlier scope values on failure',async()=>{
    const budget=new ResourceBudget({maxBytes:32}),owner=new OutputResources({budget}),create=vi.fn(),dispose=vi.fn()
    await expect(owner.run(async scope=>{scope.own(16,()=>1,dispose);scope.own(16,create);return 1})).rejects.toThrow('budget')
    expect(create).not.toHaveBeenCalled();expect(dispose).toHaveBeenCalledOnce();expect(budget.getSnapshot().chargedBytes).toBe(0);owner.dispose()
  })
  it('holds cancelled native work and its canvas/input until actual settlement',async()=>{
    const budget=new ResourceBudget({maxBytes:128}),owner=new OutputResources({budget}),native=gate<number>(),started=gate<void>(),abort=new AbortController(),dispose=vi.fn()
    const pending=owner.run(async(scope,signal)=>{
      scope.own(32,()=>1,dispose)
      return (await scope.prepare(64,()=>{started.resolve();return native.promise},()=>16,()=>{},'derived',signal)).value
    },{signal:abort.signal})
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await started.promise;abort.abort();await Promise.resolve()
    expect(budget.getSnapshot().chargedBytes).toBe(97);expect(owner.getSnapshot().jobs.active).toBe(1);expect(dispose).not.toHaveBeenCalled()
    native.resolve(1);await rejected;expect(dispose).toHaveBeenCalledOnce();expect(budget.getSnapshot().chargedBytes).toBe(0);owner.dispose()
  })
  it('defers parent cleanup while a pending child still borrows parent backing',async()=>{
    const owner=new OutputResources({maxBytes:128}),parent=new OutputScope(owner),child=parent.child(),native=gate<number>(),dispose=vi.fn()
    parent.own(32,()=>1,dispose)
    const pending=child.prepare(64,()=>native.promise,()=>16)
    const rejected=expect(pending).rejects.toThrow('disposed')
    parent.dispose();expect(dispose).not.toHaveBeenCalled();expect(owner.getSnapshot().residency.chargedBytes).toBe(96)
    native.resolve(1);await rejected;expect(dispose).toHaveBeenCalledOnce();expect(owner.getSnapshot().residency.chargedBytes).toBe(0);owner.dispose()
  })
  it('bounds queued output jobs and cancels waiting work without invoking it',async()=>{
    const owner=new OutputResources({concurrency:1,maxQueued:1}),native=gate<void>(),started=gate<void>(),abort=new AbortController(),work=vi.fn()
    const active=owner.run(async()=>{started.resolve();await native.promise;return 1})
    await started.promise
    const waiting=owner.run(work,{signal:abort.signal}),rejected=expect(waiting).rejects.toMatchObject({name:'AbortError'})
    await expect(owner.run(work)).rejects.toThrow('full');abort.abort();await rejected
    expect(work).not.toHaveBeenCalled();native.resolve();const result=await active;result.release();owner.dispose()
  })
  it('keeps failed cleanup charged/quarantined and retries it explicitly',()=>{
    const owner=new OutputResources({maxBytes:32}),dispose=vi.fn().mockImplementationOnce(()=>{throw new Error('native reset failed')})
    const pin=owner.own(16,()=>1,dispose);pin.release()
    expect(owner.getSnapshot().residency).toMatchObject({chargedBytes:16,failedEntries:1})
    owner.clearIdle();expect(dispose).toHaveBeenCalledTimes(2);expect(owner.getSnapshot().residency.chargedBytes).toBe(0);owner.dispose()
    expect(()=>owner.own(1,()=>1,()=>{})).toThrow('disposed')
  })
})

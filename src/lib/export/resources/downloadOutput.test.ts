import {afterEach,describe,expect,it,vi} from 'vitest'
import {downloadOutput} from './downloadOutput'
import {OutputResources} from './OutputResources'
import {assetSourcePool} from '../../asset/sources'

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
describe('finite download handoff',()=>{
  it('retains a result and source URL only for the bounded handoff interval',async()=>{
    vi.useFakeTimers();const owner=new OutputResources(),baseline=assetSourcePool.getSnapshot(),click=vi.fn(),link={href:'',download:'',click}
    vi.stubGlobal('document',{createElement:()=>link})
    const lease=owner.own(5,()=>new Blob(['bytes']),()=>{})
    downloadOutput(lease,value=>value,'fixture.json');lease.release()
    expect(click).toHaveBeenCalledOnce();expect((await fetch(link.href)).ok).toBe(true);expect(owner.getSnapshot().residency.protectedBytes).toBe(5)
    await vi.advanceTimersByTimeAsync(5000)
    expect(owner.getSnapshot().residency.chargedBytes).toBe(0);expect(assetSourcePool.getSnapshot().ownedUrls).toBe(baseline.ownedUrls);owner.dispose()
  })
  it('cleans click failure and rejects huge filenames before creating URLs',async()=>{
    const owner=new OutputResources(),baseline=assetSourcePool.getSnapshot(),create=vi.fn(()=>({href:'',download:'',click(){throw new Error('click failed')}}))
    vi.stubGlobal('document',{createElement:create})
    const lease=owner.own(5,()=>new Blob(['bytes']),()=>{})
    expect(()=>downloadOutput(lease,value=>value,'x'.repeat(1025))).toThrow('filename');expect(create).not.toHaveBeenCalled()
    expect(()=>downloadOutput(lease,value=>value,'fixture.json')).toThrow('click failed');lease.release();await Promise.resolve()
    expect(owner.getSnapshot().residency.chargedBytes).toBe(0);expect(assetSourcePool.getSnapshot().ownedUrls).toBe(baseline.ownedUrls);owner.dispose()
  })
})

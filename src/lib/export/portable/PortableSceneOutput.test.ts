import {describe,expect,it,vi} from 'vitest'
import {emptyScene} from '../../defaults'
import {OutputResources} from '../resources'
import {acquirePortableScene} from './PortableSceneOutput'

describe('portable output ownership',()=>{
  it('strips opaque runtime before an independent clone and preserves source IDs/content',async()=>{
    const scene=emptyScene(),url=URL.createObjectURL(new Blob(['asset bytes'],{type:'image/png'})),owner=new OutputResources()
    scene.assets=[{id:'a',type:'image',name:'a',url,runtime:{objectUrl:url}}]
    // A runtime-only opaque value must not participate in clone/JSON budgeting.
    Object.defineProperty(scene.assets[0].runtime,'opaque',{value:()=>{},enumerable:true})
    const lease=await acquirePortableScene(scene,{resources:owner})
    try{
      const result=lease.value
      expect(result).not.toBe(scene);expect(result.assets[0].runtime).toBeUndefined()
      expect(result.assets[0]).toMatchObject({id:'a',storage:{mode:'embedded'}})
      expect(await(await fetch(result.assets[0].url)).text()).toBe('asset bytes')
      result.composition.width=1;expect(scene.composition.width).not.toBe(1);expect(scene.assets[0].url).toBe(url)
      expect(owner.getSnapshot().residency.protectedBytes).toBeGreaterThan(0)
    }finally{lease.release();URL.revokeObjectURL(url);owner.dispose()}
    expect(owner.getSnapshot().residency.chargedBytes).toBe(0)
  })
  it('refuses clone allocation when its managed policy cannot fit',async()=>{
    const owner=new OutputResources({maxBytes:1024}),clone=vi.spyOn(globalThis,'structuredClone')
    try{await expect(acquirePortableScene(emptyScene(),{resources:owner})).rejects.toThrow('budget');expect(clone).not.toHaveBeenCalled()}
    finally{clone.mockRestore();owner.dispose()}
    expect(owner.getSnapshot().residency.chargedBytes).toBe(0)
  })
  it('rejects a lying response by actual bytes and awaits body cancellation on failure',async()=>{
    const scene=emptyScene(),owner=new OutputResources(),cancel=vi.fn()
    scene.assets=[{id:'a',type:'image',name:'a',url:'blob:external'}]
    const response=new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(16*1024**2+1))},cancel}),{headers:{'content-length':'1'}})
    const fetcher=vi.fn(async()=>response)
    await expect(acquirePortableScene(scene,{resources:owner,fetch:fetcher})).rejects.toThrow('byte limit')
    expect(cancel).toHaveBeenCalledOnce();expect(owner.getSnapshot().residency.chargedBytes).toBe(0);owner.dispose()
  })
  it('keeps cancelled fetch work active until actual response settlement, then drops output',async()=>{
    const scene=emptyScene(),owner=new OutputResources(),abort=new AbortController()
    scene.assets=[{id:'a',type:'image',name:'a',url:'blob:external'}]
    let finish!:(r:Response)=>void,started!:()=>void
    const ready=new Promise<void>(yes=>{started=yes}),native=new Promise<Response>(yes=>{finish=yes})
    const pending=acquirePortableScene(scene,{resources:owner,signal:abort.signal,fetch:async()=>{started();return native}})
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await ready;abort.abort();expect(owner.getSnapshot().jobs.active).toBe(1);expect(owner.getSnapshot().residency.chargedBytes).toBeGreaterThan(0)
    finish(new Response('late'));await rejected
    expect(owner.getSnapshot().residency.chargedBytes).toBe(0);expect(owner.getSnapshot().jobs.active).toBe(0);owner.dispose()
  })
})

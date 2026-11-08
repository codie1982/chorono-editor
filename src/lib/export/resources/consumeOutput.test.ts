import {describe,expect,it,vi} from 'vitest'
import {consumeOutput} from './consumeOutput'
import {OutputResources} from './OutputResources'

function gate(){let release!:()=>void;const promise=new Promise<void>(yes=>{release=yes});return {promise,release}}
describe('bounded prepared-output consumption',()=>{
  it('keeps consumer work and its independent pin active until actual cancelled settlement',async()=>{
    const resources=new OutputResources(),dispose=vi.fn(),pin=resources.own(32,()=>({text:'source'}),dispose),native=gate(),started=gate(),abort=new AbortController()
    const pending=consumeOutput(pin,async value=>{expect(value.text).toBe('source');started.release();await native.promise},{resources,signal:abort.signal})
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await started.promise;pin.release();abort.abort()
    expect(resources.getSnapshot().jobs.active).toBe(1);expect(resources.getSnapshot().residency.chargedBytes).toBe(33);expect(dispose).not.toHaveBeenCalled()
    native.release();await rejected;expect(dispose).toHaveBeenCalledOnce();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
  it('applies queue admission before a native consumer starts and unwinds rejected pins',async()=>{
    const resources=new OutputResources({concurrency:1,maxQueued:0}),pin=resources.own(16,()=>1,()=>{}),native=gate(),started=gate(),consume=vi.fn()
    const active=consumeOutput(pin,async()=>{started.release();await native.promise},{resources})
    await started.promise
    await expect(consumeOutput(pin,consume,{resources})).rejects.toThrow('full');expect(consume).not.toHaveBeenCalled()
    native.release();await active;expect(pin.value).toBe(1);pin.release();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
})

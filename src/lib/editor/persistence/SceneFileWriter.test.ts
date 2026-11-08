import {describe,expect,it,vi} from 'vitest'
import {SceneFileWriter} from './SceneFileWriter'
import {OutputResources} from '../../export/resources'
import {emptyScene} from '../../defaults'

function gate<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
const sink=()=>({write:vi.fn(async(_text:string)=>{}),close:vi.fn(async()=>{}),abort:vi.fn(async()=>{})})

describe('scene file IO ownership',()=>{
  it('admits text before opening and holds it through actual write/close',async()=>{
    const resources=new OutputResources(),writer=new SceneFileWriter(resources),native=gate<void>(),started=gate<void>(),file=sink(),scene=emptyScene()
    file.write.mockImplementation(async text=>{expect(text).toBe(JSON.stringify(scene,null,2));started.resolve();await native.promise})
    const pending=writer.write(scene,async()=>file)
    await started.promise;expect(resources.getSnapshot().jobs.active).toBe(1);expect(resources.getSnapshot().residency.protectedBytes).toBeGreaterThan(4096);expect(file.close).not.toHaveBeenCalled()
    native.resolve();await pending;expect(file.close).toHaveBeenCalledOnce();expect(file.abort).not.toHaveBeenCalled();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);writer.dispose();resources.dispose()
  })
  it('refuses insufficient capacity before file creation/truncation',async()=>{
    const resources=new OutputResources({maxBytes:100}),writer=new SceneFileWriter(resources),open=vi.fn()
    await expect(writer.write(emptyScene(),open)).rejects.toThrow('budget');expect(open).not.toHaveBeenCalled();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);writer.dispose();resources.dispose()
  })
  it('awaits cancelled actual write then aborts rather than committing, and bounds local pending files',async()=>{
    const resources=new OutputResources(),writer=new SceneFileWriter(resources),native=gate<void>(),started=gate<void>(),file=sink(),open=vi.fn(async()=>file),abort=new AbortController()
    file.write.mockImplementation(async()=>{started.resolve();await native.promise})
    const active=writer.write(emptyScene(),open,abort.signal),rejected=expect(active).rejects.toMatchObject({name:'AbortError'})
    await started.promise
    const next=writer.write(emptyScene(),open),third=writer.write(emptyScene(),open)
    const queued=[expect(next).rejects.toMatchObject({name:'AbortError'}),expect(third).rejects.toMatchObject({name:'AbortError'})]
    await expect(writer.write(emptyScene(),open)).rejects.toThrow('full')
    abort.abort();writer.dispose();expect(file.abort).not.toHaveBeenCalled();expect(resources.getSnapshot().jobs.active).toBe(1)
    await Promise.all(queued);native.resolve();await rejected
    expect(open).toHaveBeenCalledOnce();expect(file.close).not.toHaveBeenCalled();expect(file.abort).toHaveBeenCalledOnce();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
  it('quarantines failed native abort with its text, then awaits explicit async retry',async()=>{
    const resources=new OutputResources(),writer=new SceneFileWriter(resources),file=sink(),retry=gate<void>(),retried=gate<void>()
    file.write.mockRejectedValueOnce(new Error('write failed'))
    file.abort.mockRejectedValueOnce(new Error('abort failed')).mockImplementationOnce(async()=>{retried.resolve();await retry.promise})
    await expect(writer.write(emptyScene(),async()=>file)).rejects.toThrow('write failed')
    expect(resources.getSnapshot().residency.failedEntries).toBe(1);expect(resources.getSnapshot().residency.protectedBytes).toBeGreaterThan(4096)
    resources.clearIdle();await retried.promise;expect(resources.getSnapshot().residency.chargedBytes).toBeGreaterThan(4096)
    retry.resolve();await vi.waitFor(()=>expect(resources.getSnapshot().residency.chargedBytes).toBe(0))
    expect(file.abort).toHaveBeenCalledTimes(2);writer.dispose();resources.dispose()
  })
})

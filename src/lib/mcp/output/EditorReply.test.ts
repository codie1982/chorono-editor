import {describe,expect,it,vi} from 'vitest'
import {executeEditorJobInScope,type MCPHost} from '../editor'
import {OutputResources} from '../../export/resources'
import {withEditorReply} from './EditorReply'

vi.mock('../editor',()=>({executeEditorJobInScope:vi.fn()}))
const execute=vi.mocked(executeEditorJobInScope),job={id:'j',method:'snapshot',args:{}},host={} as MCPHost

describe('MCP output transport ownership',()=>{
  it('holds result and admitted JSON body through actual transport settlement',async()=>{
    const owner=new OutputResources(),dispose=vi.fn()
    execute.mockImplementationOnce(async(_job,_host,scope)=>scope.own(512,()=>({answer:'text'}),dispose).value)
    let finish!:()=>void,started!:()=>void
    const ready=new Promise<void>(yes=>{started=yes}),native=new Promise<void>(yes=>{finish=yes})
    const pending=withEditorReply(job,host,'session',async body=>{
      expect(JSON.parse(body)).toEqual({op:'reply',sessionId:'session',jobId:'j',result:{answer:'text'}})
      started();await native
    },{resources:owner})
    await ready;expect(owner.getSnapshot().residency.chargedBytes).toBeGreaterThan(512);expect(dispose).not.toHaveBeenCalled()
    finish();expect(await pending).toEqual({error:undefined});expect(dispose).toHaveBeenCalledOnce()
    expect(owner.getSnapshot().residency.chargedBytes).toBe(0);owner.dispose()
  })
  it('does not replay a completed mutation when delivery fails',async()=>{
    const owner=new OutputResources(),dispose=vi.fn(),mutation=vi.fn()
    execute.mockImplementationOnce(async(_job,_host,scope)=>{mutation();return scope.own(512,()=>({revision:1}),dispose).value})
    await expect(withEditorReply(job,host,'session',async()=>{throw new Error('network failed')},{resources:owner})).rejects.toThrow('network failed')
    expect(mutation).toHaveBeenCalledOnce();expect(dispose).toHaveBeenCalledOnce();expect(owner.getSnapshot().residency.chargedBytes).toBe(0);owner.dispose()
  })
  it('keeps abort-ignoring transport charged and active until it settles',async()=>{
    const owner=new OutputResources(),abort=new AbortController()
    execute.mockResolvedValueOnce({revision:1})
    let finish!:()=>void,started!:()=>void
    const ready=new Promise<void>(yes=>{started=yes}),native=new Promise<void>(yes=>{finish=yes})
    const pending=withEditorReply(job,host,'session',async()=>{started();await native},{resources:owner,signal:abort.signal})
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await ready;abort.abort();expect(owner.getSnapshot().jobs.active).toBe(1);expect(owner.getSnapshot().residency.chargedBytes).toBeGreaterThan(1)
    finish();await rejected;expect(owner.getSnapshot().residency.chargedBytes).toBe(0);owner.dispose()
  })
})

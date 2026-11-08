import {describe,expect,it,vi} from 'vitest'
import {saveSceneToServer} from './SceneServerSave'
import {SceneSaveConflictError} from './SceneSaveConflictError'
import {OutputResources} from '../../export/resources'
import {emptyScene} from '../../defaults'

describe('server scene body lifetime',()=>{
  it('preserves CAS payload, binds fetch and releases input/output after actual reply parsing',async()=>{
    const resources=new OutputResources(),scene=emptyScene()
    const fetcher=vi.fn(async function(this:unknown,url:RequestInfo|URL,options?:RequestInit){
      expect(this).toBe(globalThis);expect(String(url)).toBe('/api/projects/p/scenes/s');expect(JSON.parse(options!.body as string)).toEqual({scene_data:scene,server_version:3})
      expect(resources.getSnapshot().residency.protectedBytes).toBeGreaterThan(1);return new Response('{"server_version":4}')
    })
    expect(await saveSceneToServer(scene,{projectId:'p',sceneId:'s',version:3},{resources,fetch:fetcher})).toBe(4)
    expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
  it('rejects quota before fetch, conflicts without implicit retry, and bounds actual response bytes',async()=>{
    const small=new OutputResources({maxBytes:100}),fetcher=vi.fn()
    await expect(saveSceneToServer(emptyScene(),{projectId:'p',sceneId:'s',version:0},{resources:small,fetch:fetcher})).rejects.toThrow('budget');expect(fetcher).not.toHaveBeenCalled();small.dispose()
    const resources=new OutputResources(),conflict=vi.fn(async()=>new Response('{}',{status:409}))
    await expect(saveSceneToServer(emptyScene(),{projectId:'p',sceneId:'s',version:0},{resources,fetch:conflict})).rejects.toBeInstanceOf(SceneSaveConflictError);expect(conflict).toHaveBeenCalledOnce()
    await expect(saveSceneToServer(emptyScene(),{projectId:'p',sceneId:'s',version:0},{resources,fetch:async()=>new Response('x'.repeat(65537))})).rejects.toThrow('byte limit')
    expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
  it('keeps an abort-ignoring fetch active and cancels a late response body before release',async()=>{
    const resources=new OutputResources(),abort=new AbortController(),cancel=vi.fn()
    let finish!:(response:Response)=>void,started!:()=>void
    const ready=new Promise<void>(yes=>{started=yes}),native=new Promise<Response>(yes=>{finish=yes})
    const pending=saveSceneToServer(emptyScene(),{projectId:'p',sceneId:'s',version:0},{resources,signal:abort.signal,fetch:async()=>{started();return native}})
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await ready;abort.abort();expect(resources.getSnapshot().jobs.active).toBe(1);expect(resources.getSnapshot().residency.chargedBytes).toBeGreaterThan(1)
    finish(new Response(new ReadableStream({cancel})));await rejected
    expect(cancel).toHaveBeenCalledOnce();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
})

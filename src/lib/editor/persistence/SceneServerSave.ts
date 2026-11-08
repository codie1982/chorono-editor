import type {ChronoScene} from '../../types'
import {assetSourcePool} from '../../asset/sources'
import {OutputResources,editorOutputResources,outputJson} from '../../export/resources'
import {BoundedBinaryReader,BoundedTextReader} from '../../resources/io'
import {SceneSaveConflictError} from './SceneSaveConflictError'

/** Existing PATCH/CAS payload with owned serialization through actual fetch and
 * bounded reply decoding. No server schema/auth changes, implicit retries or
 * full portable embedding. Source URLs survive until actual settlement. Injected
 * fetch is bound to the platform receiver; caller supplies cancellation. */
export async function saveSceneToServer(scene:ChronoScene,target:{projectId:string;sceneId:string;version:number},
  options:{signal?:AbortSignal;resources?:OutputResources;fetch?:typeof fetch}={}):Promise<number>{
  const resources=options.resources??editorOutputResources,fetcher=(options.fetch??globalThis.fetch).bind(globalThis)
  return assetSourcePool.withAssets(scene.assets,async()=>{
    const result=await resources.run(async(scope,signal)=>{
      const body=outputJson(scope,{scene_data:scene,server_version:target.version},{maxBytes:64*1024**2,maxChars:64*1024**2})
      const response=await fetcher(`/api/projects/${encodeURIComponent(target.projectId)}/scenes/${encodeURIComponent(target.sceneId)}`,{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:body.value,signal,
      })
      // Even failure/conflict bodies are cancelled/settled by the bounded reader.
      const reader=new BoundedBinaryReader({budget:scope.budget,maxBytes:65536})
      if(!response.ok){
        try{await reader.readResponse(response,{signal})}catch{/* HTTP error is reported below after body cleanup. */}
        scope.check(signal)
        if(response.status===409)throw new SceneSaveConflictError()
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const input=await reader.readResponse(response,{signal})
      try{return await new BoundedTextReader({budget:scope.budget,maxInputBytes:65536}).withBytes(new Uint8Array(input.buffer),text=>{
        const metadata=scope.own(Math.max(1,text.length*8+4096),()=>JSON.parse(text) as {server_version?:unknown})
        const version=metadata.value.server_version
        if(typeof version!=='number'||!Number.isSafeInteger(version)||version<0)throw new Error('Invalid scene save response version.')
        scope.check(signal);return version
      },{signal})}finally{input.release()}
    },options)
    try{return result.value}finally{result.release()}
  })
}

import type {ChronoScene} from '../../types'
import {measureJson} from '../../format/json'
import {BoundedBinaryReader} from '../../resources/io'
import {assetSourcePool} from '../../asset/sources'
import {OutputResources,editorOutputResources,type OutputScope} from '../resources'
import {outputBase64} from '../resources/OutputEncoding'
import type {ResourceLease} from '../../resources/residency'
import {sceneSourceData} from '../../format/scene/sceneSourceData'

const SCENE_CHARS=32*1024**2,ASSET_BYTES=16*1024**2

/** Version-preserving portable conversion inside an existing output job. Pins
 * original URLs through fetch/read/conversion; strips runtime fields before
 * cloning so DOM/GPU/decoder state is never copied. Unknown plain source fields,
 * stable IDs and non-Blob URLs survive. Scene clone/node policy and embedded
 * strings overlap the same output/host budget. Encoded files stream under the
 * actual 16 MiB cap, not response.blob() followed by a late size check.
 *
 * Scope owns the independent mutable scene through consumption. Caller validates
 * the scene protocol at its boundary. Native fetch/body buffers are opaque; no
 * process-RAM hard cap is claimed. Injected fetch retains platform receiver.
 */
export async function portableSceneInScope(scene:ChronoScene,scope:OutputScope,signal?:AbortSignal,fetcher:typeof fetch=globalThis.fetch):Promise<ChronoScene>{
  return assetSourcePool.withAssets(scene.assets,async()=>{
    scope.check(signal)
    if(scene.assets.length>500)throw new RangeError('Portable scene asset limit exceeded.')
    const view=scope.child()
    try{
      const source=view.own(Math.max(1,scene.assets.length*256+256),()=>sceneSourceData(scene))
      const measured=measureJson(source.value,{maxChars:SCENE_CHARS,maxBytes:SCENE_CHARS*3})
      const copy=scope.own(Math.max(1,measured.chars*2+measured.nodes*64),()=>structuredClone(source.value)).value
      view.dispose()
      const reader=new BoundedBinaryReader({maxBytes:ASSET_BYTES,budget:scope.budget}),fetchSource=fetcher.bind(globalThis)
      for(const asset of copy.assets){
        scope.check(signal)
        if(!asset.url.startsWith('blob:'))continue
        const temporary=scope.child()
        try{
          const response=await fetchSource(asset.url,{signal})
          const input=await reader.readResponse(response,{signal})
          try{
            const encoded=outputBase64(temporary,new Uint8Array(input.buffer),ASSET_BYTES,signal)
            // MIME originates from the response but is bounded independently of
            // source bytes. Preserve the old default and complete header value.
            const mime=response.headers.get('content-type')||'application/octet-stream'
            if(mime.length>1024)throw new RangeError('Portable asset MIME header is too long.')
            const chars=5+mime.length+8+encoded.value.length
            if(chars>SCENE_CHARS)throw new RangeError('Portable scene size limit exceeded.')
            asset.url=scope.own(chars*2,()=>`data:${mime};base64,${encoded.value}`).value
            asset.storage={...asset.storage,mode:'embedded'}
          }finally{input.release()}
        }finally{temporary.dispose()}
      }
      scope.check(signal);measureJson(copy,{maxChars:SCENE_CHARS,maxBytes:SCENE_CHARS*3});return copy
    }finally{view.dispose()}
  })
}

/** Independent portable-scene result pin. Release after serialization/transport;
 * construction queues in the output owner. Composed MCP uses the in-scope step
 * instead of recursively entering the same bounded queue. */
export function acquirePortableScene(scene:ChronoScene,options:{signal?:AbortSignal;resources?:OutputResources;fetch?:typeof fetch}={}):Promise<ResourceLease<ChronoScene>>{
  return assetSourcePool.withAssets(scene.assets,()=>(options.resources??editorOutputResources).run((scope,signal)=>portableSceneInScope(scene,scope,signal,options.fetch),{signal:options.signal}))
}

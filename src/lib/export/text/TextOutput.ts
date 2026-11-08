import type {ChronoScene} from '../../types'
import {assetSourcePool} from '../../asset/sources'
import {measureJson,utf8ByteLength} from '../../format/json'
import {OutputResources,editorOutputResources,outputJson,type OutputScope} from '../resources'
import {renderHTMLDocument} from '../html/htmlExport'
import {runtimePackageInScope} from '../runtime/RuntimeOutput'
import {legacyRuntimeInScope} from '../runtime/LegacyRuntimeOutput'
import {svgInScope} from '../vector/SVGOutput'
import type {ResourceLease} from '../../resources/residency'
import type {SceneTextKind,SceneTextOptions,TextOutputResult,TextDownloadResult} from './types'

export interface TextOutputExecution{signal?:AbortSignal;resources?:OutputResources}
const TEXT_BYTES=64*1024**2

/** Own one text output through editor preview, clipboard or file consumption.
 * Queued preparation pins the borrowed source assets. Inner serialization and
 * conversion share the output allocator; returned text is valid only while its
 * result pin lives. UI should show a bounded preview, not clone/split all lines.
 * This preserves all existing format/schema and external source URL policies. */
export function acquireSceneText(scene:ChronoScene,kind:SceneTextKind,options:SceneTextOptions={},execution:TextOutputExecution={}):Promise<ResourceLease<TextOutputResult>>{
  return assetSourcePool.withAssets(scene.assets,()=>(execution.resources??editorOutputResources).run((scope,signal)=>sceneTextInScope(scene,kind,scope,signal,options),execution))
}

/** Download preparation avoids retaining the final full text beside its native
 * Blob after construction. Blob copy is admitted while text remains pinned;
 * native Blob internals are opaque. Handoff/download retains its own result pin. */
export function acquireTextDownload(scene:ChronoScene,kind:SceneTextKind,options:SceneTextOptions={},execution:TextOutputExecution={}):Promise<ResourceLease<TextDownloadResult>>{
  return assetSourcePool.withAssets(scene.assets,()=>(execution.resources??editorOutputResources).run(async(scope,signal)=>{
    const temporary=scope.child()
    try{
      const text=await sceneTextInScope(scene,kind,temporary,signal,options)
      const blob=scope.own(Math.max(1,text.byteLength),()=>new Blob([text.text],{type:text.mimeType}))
      scope.check(signal);return {blob:blob.value,filename:text.filename,warnings:text.warnings}
    }finally{temporary.dispose()}
  },execution))
}

/** Existing format preparation inside an already admitted job. No nested run.
 * Work/result overlap is accepted before native string/buffer/Blob construction.
 * Output limit is actual 64 MiB UTF-8, except SVG's additional geometry/text cap.
 * Cancellation is checked between phases, never pretends synchronous JS stopped.
 */
export async function sceneTextInScope(scene:ChronoScene,kind:SceneTextKind,scope:OutputScope,signal?:AbortSignal,options:SceneTextOptions={}):Promise<TextOutputResult>{
  scope.check(signal)
  const name=scene.composition.id||'scene'
  if(name.length>512)throw new RangeError('Output project name exceeds 512 characters.')
  if(kind==='svg'){
    const result=await svgInScope(scene,scope,signal,options.svg)
    return describeText(result.svg,result.filename,'image/svg+xml;charset=utf-8',result.warnings)
  }
  if(kind==='html')return htmlInScope(scene,scope,signal,options)
  const temporary=scope.child()
  try{
    const value=kind==='runtime-json'?runtimePackageInScope(scene,temporary)
      :kind==='legacy-runtime-json'?legacyRuntimeInScope(scene,temporary,options.runtime):scene
    const text=outputJson(scope,value,{maxBytes:TEXT_BYTES,maxChars:TEXT_BYTES,space:2})
    const warnings=kind==='runtime-json'&&'warnings' in value?
      scope.own(Math.max(1,value.warnings.reduce((sum,warning)=>sum+warning.message.length*2+64,0)),()=>value.warnings.map(warning=>warning.message)).value:[]
    const filename=kind==='runtime-json'?`${name}.runtime.json`:kind==='legacy-runtime-json'?`${name}.runtime.json`:`${name}.json`
    scope.check(signal);return describeText(text.value,filename,'application/json',warnings)
  }finally{temporary.dispose()}
}

/** Compact JSON/HTML escaping/template use the same renderer as exportHTML.
 * Exact `<`/`>` count avoids a worst-case 6× reservation for ordinary projects.
 * Fixed template/escaped-option overhead is conservatively admitted first.
 * Optional strings are bounded to 4096 UTF-16 units before native replacement.
 */
async function htmlInScope(scene:ChronoScene,scope:OutputScope,signal:AbortSignal|undefined,options:SceneTextOptions):Promise<TextOutputResult>{
  const temporary=scope.child()
  try{
    const values=[options.html?.title??scene.composition.id??'',options.html?.runtimeUrl??'',options.html?.pageBackground??'']
    if(values.some(value=>value.length>4096))throw new RangeError('HTML option string exceeds 4096 characters.')
    const measured=measureJson(scene,{maxChars:TEXT_BYTES,maxBytes:TEXT_BYTES})
    const json=outputJson(temporary,scene,{maxChars:TEXT_BYTES,maxBytes:TEXT_BYTES})
    const escapedChars=measured.chars+5*measured.scriptEscapes
    if(escapedChars>TEXT_BYTES)throw new RangeError('Embedded HTML JSON exceeds the text limit.')
    const overlap=temporary.own(Math.max(1,escapedChars*4),()=>null)
    const escaped=temporary.own(Math.max(1,escapedChars*2),()=>json.value.replace(/</g,'\\u003c').replace(/>/g,'\\u003e'))
    overlap.release()
    const estimate=escapedChars+8192+values.reduce((sum,value)=>sum+value.length*6,0)
    const result=await scope.prepare(Math.max(1,estimate*2),async()=>renderHTMLDocument(scene.composition,escaped.value,options.html),value=>value.html.length*2,()=>{},'derived',signal)
    return describeText(result.value.html,result.value.filename,'text/html;charset=utf-8')
  }finally{temporary.dispose()}
}

/** Exact UTF-8 and line count without Blob construction or split arrays. */
export function describeText(text:string,filename:string,mimeType:string,warnings:readonly string[]=[]):TextOutputResult{
  const byteLength=utf8ByteLength(text,TEXT_BYTES);let lines=1
  for(let i=0;i<text.length;i++)if(text.charCodeAt(i)===10)lines++
  return {text,filename,mimeType,byteLength,lines,warnings}
}

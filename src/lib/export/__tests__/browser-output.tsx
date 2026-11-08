import {StrictMode,useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {emptyScene,newRectLayer,newTimeline,newAudioLayer} from '../../defaults'
import {editorResourceBudget} from '../../resources/budget'
import {assetSourcePool} from '../../asset/sources'
import {renderSurfacePool} from '../../render/resources/CanvasSurfacePool'
import {OutputResources,outputJson,outputBase64} from '../resources'
import {acquireRasterImage} from '../raster/RasterExportEngine'
import {acquireSequence} from '../sequence/SequenceExportEngine'
import {acquirePortableScene} from '../portable'
import {acquireAudioMix} from '../../audio/audioRender'
import {getAudioAssetService} from '../../audio/AudioAssetService'
import {encodeWav} from '../../audio/wav'
import {ZipReader} from '../../import/zip'
import {useOutputOperation} from '@/components/export/hooks/useOutputOperation'
import {MediaResourcesSection} from '@/components/resources/MediaResourcesSection'
import {ProjectResourceMonitor} from '../../resources/monitor/ProjectResourceMonitor'
import type {ResourceLease} from '../../resources/residency'
// @ts-expect-error immutable stage-before source resolved only by QA bundler
import {exportRasterImage as legacyRaster} from 'legacy-raster-reference'
// @ts-expect-error immutable stage-before source resolved only by QA bundler
import {renderAudioMix as legacyAudio} from 'legacy-audio-reference'

/** Actual native output acceptance. Independent frozen sources preserve the
 * stage-before raster/audio workflows; their codecs and common renderer remain
 * identical. Copied verification bitmaps/ZIP bytes and legacy backing are QA
 * evidence outside managed output totals, not production allocations. */
async function run(){
  const rows:{name:string;passed:boolean;details?:unknown}[]=[],owner=new OutputResources({budget:editorResourceBudget})
  const sourceBefore=assetSourcePool.getSnapshot(),budgetBefore=editorResourceBudget.getSnapshot()
  const check=(name:string,passed:boolean,details?:unknown)=>{rows.push({name,passed,details});if(!passed)throw new Error(name)}
  const scene=emptyScene(),rect=newRectLayer(),timeline=newTimeline()
  scene.composition={...scene.composition,width:96,height:64,durationMs:1000,frameRate:2}
  rect.size={width:42,height:31};rect.transform={...rect.transform,x:8,y:12};rect.style={fill:{type:'solid',color:'#40b9ef',opacity:80},stroke:{color:'#e2e8f0',width:2}}
  timeline.durationMs=1000;timeline.autoplay=true;timeline.loop=false
  timeline.tracks=[{target:`layers.${rect.id}.transform.x`,keyframes:[
    {id:'a',timeMs:0,value:8,easing:{type:'linear'}},{id:'b',timeMs:1000,value:40,easing:{type:'linear'}},
  ]}]
  scene.layers=[rect];scene.timelines=[timeline]
  /** Decode real native codec output to exact RGBA for comparison. */
  async function pixels(blob:Blob){
    const image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height
    try{const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data}
    finally{image.close();canvas.width=0;canvas.height=0}
  }
  const equal=(a:ArrayLike<number>,b:ArrayLike<number>)=>a.length===b.length&&Array.prototype.every.call(a,(v:number,i:number)=>v===b[i])
  const urls:ReturnType<typeof assetSourcePool.create>[]=[],nativeHost=document.getElementById('ui')!,panelHost=document.getElementById('panel')!
  let error:unknown,root:ReturnType<typeof createRoot>|undefined,panel:ReturnType<typeof createRoot>|undefined
  try{
    for(const format of ['png','webp','jpeg'] as const)for(const scale of [1,2]){
      const options={format,scale,timeMs:500,background:'transparent' as const,quality:.92}
      const reference=await legacyRaster(scene,new Map(),options),result=await acquireRasterImage(scene,new Map(),options,{resources:owner})
      try{
        check(`native ${format} ${scale}x decoded RGBA equals frozen raster`,equal(await pixels(reference.blob),await pixels(result.value.blob)),{bytes:result.value.blob.size})
        check(`native ${format} ${scale}x dimensions and warnings preserved`,reference.width===result.value.width&&reference.height===result.value.height&&JSON.stringify(reference.warnings)===JSON.stringify(result.value.warnings))
      }finally{result.release()}
    }
    const sequence=await acquireSequence(scene,new Map(),{format:'png',fps:2},{resources:owner})
    try{
      const entries=await new ZipReader().readAll(await sequence.value.blob.arrayBuffer())
      check('native sequence has the same two sampled frame names',JSON.stringify(Array.from(entries.keys()))===JSON.stringify(['frame_0001.png','frame_0002.png']))
      let i=0
      for(const bytes of Array.from(entries.values())){
        const reference=await legacyRaster(scene,new Map(),{format:'png',timeMs:i++*500})
        check(`native sequence frame ${i} exact RGBA`,equal(await pixels(new Blob([Uint8Array.from(bytes)])),await pixels(reference.blob)))
      }
    }finally{sequence.release()}
    const beforeFailure=owner.getSnapshot().residency.chargedBytes
    let denied=false
    try{await acquireSequence(scene,new Map(),{format:'png',fps:2},{resources:owner,maxArchiveBytes:22})}catch{denied=true}
    check('archive byte refusal releases every partial frame/ZIP output',denied&&owner.getSnapshot().residency.chargedBytes===beforeFailure)
    const source=assetSourcePool.create(new Blob(['portable native fixture'],{type:'image/png'}));urls.push(source)
    const portableScene={...scene,assets:[{id:'portable',name:'a',type:'image' as const,url:source.url,runtime:{objectUrl:source.url}}]}
    const portable=await acquirePortableScene(portableScene,{resources:owner})
    try{check('portable embedded source survives independently and has no runtime',await(await fetch(portable.value.assets[0].url)).text()==='portable native fixture'&&!portable.value.assets[0].runtime)}finally{portable.release()}
    const left=new Float32Array(4800),right=new Float32Array(4800)
    for(let i=0;i<left.length;i++){left[i]=Math.sin(i*.07)*.3;right[i]=Math.cos(i*.05)*.2}
    const wav=encodeWav({numberOfChannels:2,length:4800,sampleRate:48000,getChannelData:(channel:number)=>channel?right:left})
    const audioSource=assetSourcePool.create(new Blob([wav],{type:'audio/wav'}));urls.push(audioSource)
    const audioScene=emptyScene();audioScene.composition.durationMs=100
    audioScene.assets=[{id:'audio',name:'audio',type:'audio',url:audioSource.url,durationMs:100}];audioScene.layers=[newAudioLayer('audio',100)]
    const reference=await legacyAudio(audioScene),mixed=await acquireAudioMix(audioScene,{},{resources:owner})
    try{check('actual OfflineAudioContext WAV matches frozen audio byte for byte',equal(reference.bytes,mixed.value.bytes),{bytes:mixed.value.bytes.length,frames:mixed.value.frames})}finally{mixed.release()}
    check('normal native outputs leave no managed output records',owner.getSnapshot().residency.chargedBytes===0)
    let effects=0,api:ReturnType<typeof useOutputOperation>|undefined,published=0,released=0
    const documentSignal=new AbortController()
    const Harness=()=>{
      api=useOutputOperation(documentSignal.signal);useEffect(()=>{effects++},[])
      return <div><p>Real development StrictMode output controls</p><button onClick={()=>api?.cancel()} disabled={!api?.busy||api.cancelling}>{api?.cancelling?'Cancelling…':'Cancel output'}</button><p>{api?.busy?'Native result handoff pending':'Idle'}</p></div>
    }
    root=createRoot(nativeHost);flushSync(()=>root!.render(<StrictMode><Harness/></StrictMode>))
    check('actual development StrictMode replays effects',effects===2,{effects})
    let deliver!:()=>void,ready!:()=>void
    const gate=new Promise<void>(yes=>{deliver=yes}),started=new Promise<void>(yes=>{ready=yes})
    const acquire=async(signal:AbortSignal):Promise<ResourceLease<{blob:Blob}>>=>{
      const value=await acquireRasterImage(scene,new Map(),{format:'png'},{resources:owner,signal})
      ready();await gate
      // Delivery gate follows actual native completion; it is not represented
      // as a still-running native encoder or a CPU/GPU utilization measurement.
      return {get value(){return value.value},retain:()=>value.retain(),release(){released++;value.release()}}
    }
    const request=api!.run(acquire,()=>{published++})
    await started;await new Promise<void>(yes=>requestAnimationFrame(()=>yes()))
    panel=createRoot(panelHost)
    const monitor=new ProjectResourceMonitor({scene,media:new Map(),isPlaying:false},{outputs:owner})
    flushSync(()=>panel!.render(<MediaResourcesSection snapshot={monitor.getSnapshot()} query={{page:0,search:''}} onQuery={()=>{}}/>))
    check('panel reports retained output through the production monitor',panelHost.textContent?.includes('Output preparation')===true&&owner.getSnapshot().residency.protectedBytes>0)
    const cancel=nativeHost.querySelector('button')!;cancel.click()
    await new Promise<void>(yes=>requestAnimationFrame(()=>yes()))
    check('real cancel button retains busy state until result delivery settles',nativeHost.textContent?.includes('Cancelling…')===true&&owner.getSnapshot().residency.protectedBytes>0)
    documentSignal.abort();flushSync(()=>root!.unmount());root=undefined
    deliver();await request
    check('cancel/document abort/unmount discard late native output exactly once',published===0&&released===1&&owner.getSnapshot().residency.chargedBytes===0,{published,released})
    const reply=await owner.run(async(scope,signal)=>{
      const data=outputBase64(scope,new TextEncoder().encode('native response'),1024,signal)
      return outputJson(scope,{result:{data:data.value}}).value
    })
    try{check('native JSON/base64 transport representation is preserved',atob(JSON.parse(reply.value).result.data)==='native response')}finally{reply.release()}
  }catch(failure){error=String(failure)}
  finally{
    root?.unmount();panel?.unmount();urls.forEach(url=>url.release());owner.dispose();renderSurfacePool.clearIdle();getAudioAssetService().clearIdle();await getAudioAssetService().dispose();await Promise.resolve()
  }
  const final={output:owner.getSnapshot(),budget:editorResourceBudget.getSnapshot(),sources:assetSourcePool.getSnapshot()}
  rows.push({name:'all managed output/source owners return to baseline',passed:final.output.residency.chargedBytes===0&&final.output.jobs.active===0&&final.budget.chargedBytes===budgetBefore.chargedBytes&&final.sources.references===sourceBefore.references&&final.sources.ownedUrls===sourceBefore.ownedUrls,details:final})
  const identity=await(await fetch('output-ownership-sources.json')).json()
  return {passed:!error&&rows.every(row=>row.passed),error,results:rows,final,build:{bundleSha256:identity.bundleSha256},environment:{userAgent:navigator.userAgent,dpr:devicePixelRatio},scope:'Native codecs, actual offline WAV, frozen stage-before workflows, exact RGBA and development StrictMode hook/panel. Delivery gate holds a completed native result. QA copies/reference buffers are outside output totals. 512 MiB shared admission is policy, not total process RAM.'}
}

document.getElementById('app')!.innerHTML='<style>body{background:#0b1220;color:#e2e8f0;font:14px system-ui;margin:24px}button{padding:10px}pre{white-space:pre-wrap}#panel{max-width:640px}</style><h1>Native output ownership · OPT29</h1><p>Raster RGBA · ZIP frames · OfflineAudioContext · Portable data · StrictMode cancellation</p><button id="run">Run output checks</button><p id="status">Ready</p><div id="ui"></div><pre id="summary"></pre><pre id="report" hidden></pre><div id="panel"></div>'
const button=document.getElementById('run') as HTMLButtonElement
button.onclick=async()=>{
  button.disabled=true;document.getElementById('status')!.textContent='Running'
  try{
    const result=await run();document.getElementById('report')!.textContent=JSON.stringify(result,null,2)
    document.getElementById('summary')!.textContent=JSON.stringify({passed:result.passed,error:result.error,checks:result.results.length,peakPolicyBytes:result.final.budget.peakBytes,finalCharge:result.final.budget.chargedBytes,rows:result.results.map(row=>({name:row.name,passed:row.passed}))},null,2)
    document.getElementById('status')!.textContent=result.passed?'PASS':'FAIL'
  }catch(error){document.getElementById('status')!.textContent='FAIL';document.getElementById('report')!.textContent=JSON.stringify({passed:false,error:String(error)})}
  finally{button.disabled=false}
}

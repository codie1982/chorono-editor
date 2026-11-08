import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {flushSync} from 'react-dom'
import {emptyScene,newRectLayer,newTextLayer,newBezierPathLayer,newTimeline} from '../../defaults'
import {editorResourceBudget} from '../../resources/budget'
import {browserMemoryReader} from '../../resources/memory/BrowserMemoryReader'
import {assetSourcePool} from '../../asset/sources'
import {until,deliveryGate} from '../../resources/testing/nativeSettlement'
import {OutputResources,editorOutputResources,downloadOutput} from '../resources'
import {acquireSceneText,acquireTextDownload} from '../text'
import {SceneFileWriter} from '../../editor/persistence'
import {useFileVersioning,type SceneDirectory} from '@/app/hooks/useFileVersioning'
import JsonModal from '@/components/JsonModal'
import {useOutputOperation} from '@/components/export/hooks/useOutputOperation'
// @ts-expect-error immutable stage-before workflow, resolved by QA bundler
import {exportSVG as beforeSvg} from 'integration-before-svg'
// @ts-expect-error immutable stage-before workflow, resolved by QA bundler
import {exportHTML as beforeHtml} from 'integration-before-html'
// @ts-expect-error immutable stage-before workflow, resolved by QA bundler
import {exportToRuntimeJSON as beforeRuntime} from 'integration-before-runtime'

/** Native platform integration, not editor authoring eval. JSON/HTML/SVG
 * references come from immutable stage-before snapshots. OPFS uses a fresh test
 * namespace, never a user-selected directory. Completed-write delivery gates are
 * explicitly distinct from unfinished native IO. */
async function run(){
  const rows:{name:string;passed:boolean;details?:unknown}[]=[],resources=new OutputResources({budget:editorResourceBudget})
  const baseline={budget:editorResourceBudget.getSnapshot(),sources:assetSourcePool.getSnapshot()}
  const check=(name:string,passed:boolean,details?:unknown)=>{rows.push({name,passed,details});if(!passed)throw new Error(name)}
  const scene=emptyScene(),group={...newRectLayer(),id:'group',type:'group' as const},shape=newRectLayer(),path=newBezierPathLayer(),text=newTextLayer(),timeline=newTimeline()
  scene.composition={...scene.composition,id:'native-output',width:320,height:180,durationMs:1000}
  group.transform={...group.transform,x:0,y:0,anchorX:0,anchorY:0};shape.parentId=group.id;text.parentId=group.id;path.parentId=group.id
  shape.transform={...shape.transform,x:40,y:35,anchorX:0,anchorY:0};shape.shapeKind='star';shape.shapeParams={kind:'star',sides:7}
  shape.style={fill:{type:'gradient',gradient:{type:'linear',angle:40,stops:[{offset:0,color:'#40b9ef'},{offset:1,color:'#ab78f5'}]}},stroke:{color:'#eee',width:2}}
  text.text={...text.text!,value:'<ß> & Chorono',uppercase:true,fontSize:18,color:'#e2e8f0'};text.transform={...text.transform,x:10,y:135,anchorX:0,anchorY:0}
  timeline.durationMs=1000;timeline.loop=false;timeline.autoplay=true;timeline.tracks=[{target:`layers.${group.id}.transform.x`,keyframes:[
    {id:'a',timeMs:0,value:0,easing:{type:'linear'}},{id:'b',timeMs:1000,value:20,easing:{type:'linear'}},
  ]}]
  scene.layers=[group,shape,path,text];scene.timelines=[timeline]
  const host=document.getElementById('ui')!,pictures=document.getElementById('pictures')!
  const writers:SceneFileWriter[]=[];let root:ReturnType<typeof createRoot>|undefined,error:unknown
  const operations:Promise<void>[]=[]
  let privateRoot:FileSystemDirectoryHandle|undefined,namespace:string|undefined,unblock:(()=>void)|undefined
  /** Independent native SVG decode/evidence canvas; outside managed policy. */
  async function raster(svg:string,label:string){
    const parsed=new DOMParser().parseFromString(svg,'image/svg+xml')
    const parseError=parsed.querySelector('parsererror')
    if(parseError)throw new Error(`Invalid SVG fixture: ${parseError.textContent}`)
    const source=assetSourcePool.create(new Blob([svg],{type:'image/svg+xml'})),image=new Image(),canvas=document.createElement('canvas')
    try{
      image.src=source.url;await image.decode()
      canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d')!;context.drawImage(image,0,0)
      const figure=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent=label;figure.append(canvas,caption);pictures.append(figure)
      return context.getImageData(0,0,canvas.width,canvas.height).data
    }finally{image.src='';source.release()}
  }
  try{
    const fourSeasons=await(await fetch('four-seasons.chorono.json')).json() as typeof scene
    for(const kind of ['editor-json','html'] as const){
      const pin=await acquireSceneText(fourSeasons,kind,{}, {resources})
      try{
        const expected=kind==='editor-json'?JSON.stringify(fourSeasons,null,2):beforeHtml(fourSeasons).html
        const heap=browserMemoryReader.getSnapshot().heap
        check(`Four Seasons ${kind} preserves full output under 512 MiB policy`,pin.value.text===expected&&editorResourceBudget.getSnapshot().chargedBytes<=512*1024**2&&(!heap||heap.used<=768*1024**2),{layers:fourSeasons.layers.length,bytes:pin.value.byteLength,policy:editorResourceBudget.getSnapshot().chargedBytes,heap})
      }finally{pin.release()}
    }
    for(const animated of [false,true])for(const timeMs of [0,500]){
      const options={animated,timeMs,background:'transparent' as const},before=beforeSvg(scene,options)
      const actual=await acquireSceneText(scene,'svg',{svg:options},{resources})
      try{
        check(`frozen SVG exact text · animated ${animated} · ${timeMs}ms`,actual.value.text===before.svg&&JSON.stringify(actual.value.warnings)===JSON.stringify(before.warnings))
        if(!animated&&timeMs===500){
          const left=await raster(before.svg,'Frozen before'),right=await raster(actual.value.text,'Bounded output')
          check('actual native SVG decoding preserves exact RGBA',left.length===right.length&&left.every((value,i)=>value===right[i]))
        }
      }finally{actual.release()}
    }
    for(const kind of ['editor-json','html','legacy-runtime-json'] as const){
      const actual=await acquireSceneText(scene,kind,{}, {resources})
      try{
        const expected=kind==='editor-json'?JSON.stringify(scene,null,2):kind==='html'?beforeHtml(scene).html:beforeRuntime(scene)
        check(`${kind} exact complete text equals stage-before workflow`,actual.value.text===expected,{bytes:actual.value.byteLength})
      }finally{actual.release()}
    }
    privateRoot=await navigator.storage.getDirectory();namespace=`chorono-output-qa-${Date.now()}`
    const directory=await privateRoot.getDirectoryHandle(namespace,{create:true}),file=await directory.getFileHandle('native.json',{create:true})
    const writer=new SceneFileWriter(resources);writers.push(writer)
    await writer.write(scene,()=>file.createWritable())
    check('real native file write/close preserves complete JSON',await(await file.getFile()).text()===JSON.stringify(scene,null,2))
    const written=deliveryGate(),deliver=deliveryGate(),abort=new AbortController();unblock=deliver.release
    const pending=writer.write({...scene,composition:{...scene.composition,id:'must-not-commit'}},async()=>{
      const stream=await file.createWritable()
      return {write:async(value:string)=>{await stream.write(value);written.release();await deliver.promise},close:()=>stream.close(),abort:()=>stream.abort()}
    },abort.signal).then(()=>false,failure=>failure instanceof Error&&failure.name==='AbortError')
    await written.promise;abort.abort()
    check('completed native write stays owned while cancelled commit is pending',resources.getSnapshot().residency.protectedBytes>4096&&resources.getSnapshot().jobs.active===1)
    deliver.release();check('cancel aborts actual native writer and retains previous committed file',await pending&&await(await file.getFile()).text()===JSON.stringify(scene,null,2));unblock=undefined
    let api:ReturnType<typeof useFileVersioning>|undefined,opens=0
    const doc=new AbortController(),adapter:SceneDirectory={name:'Private native QA folder',getFileHandle:async(name,options)=>{opens++;return directory.getFileHandle(name,options)}}
    const Harness=({value}:{value:typeof scene})=>{
      api=useFileVersioning(value,{baseName:'hook',interval_ms:20,fallback_ms:100,snapshot_ms:600000,documentSignal:doc.signal,pickDirectory:async()=>adapter})
      return <div><button onClick={()=>void api!.pickDirectory()}>Select private QA folder</button><p>{api.state} · versions {api.snapshotCount}</p></div>
    }
    root=createRoot(host);flushSync(()=>root!.render(<StrictMode><Harness value={scene}/></StrictMode>))
    host.querySelector('button')!.click();await until(()=>!!api?.lastSavedAt&&api.snapshotCount===1)
    const initialOpens=opens;let latest=scene
    for(let i=0;i<50;i++){latest={...scene,composition:{...scene.composition,width:321+i}};flushSync(()=>root!.render(<StrictMode><Harness value={latest}/></StrictMode>))}
    await until(()=>api?.state==='saved'&&opens>initialOpens&&editorOutputResources.getSnapshot().jobs.active===0)
    check('StrictMode folder hook coalesces 50 edits and saves the complete latest scene',await(await(await directory.getFileHandle('hook.json')).getFile()).text()===JSON.stringify(latest,null,2)&&opens-initialOpens<5,{opensAfterBurst:opens-initialOpens,versions:api!.snapshotCount})
    doc.abort();flushSync(()=>root!.unmount());root=undefined
    await until(()=>editorOutputResources.getSnapshot().jobs.active===0&&resources.getSnapshot().jobs.active===0)
    const large={...scene,initialState:{fixture:'x'.repeat(350000)}}
    const modalDoc=new AbortController();root=createRoot(host)
    flushSync(()=>root!.render(<StrictMode><JsonModal scene={large} documentSignal={modalDoc.signal} onClose={()=>{}}/></StrictMode>))
    await until(()=>!!host.querySelector('pre code')?.textContent?.includes('Preview limited'))
    check('real JSON modal keeps full output owned but bounds displayed text',host.querySelector('pre code')!.textContent!.length<200200&&editorOutputResources.getSnapshot().residency.protectedBytes>350000)
    modalDoc.abort();flushSync(()=>root!.unmount());root=undefined
    await until(()=>editorOutputResources.getSnapshot().residency.chargedBytes===0)
    check('preview document abort/unmount releases all managed text pins',editorOutputResources.getSnapshot().residency.chargedBytes===0)
    let operation:ReturnType<typeof useOutputOperation>|undefined,published=0
    const consumerDoc=new AbortController(),consuming=deliveryGate(),consumerDelivery=deliveryGate();unblock=consumerDelivery.release
    const Consumer=()=>{
      operation=useOutputOperation(consumerDoc.signal)
      return <div><button onClick={()=>{
        operations.push(operation!.run(signal=>acquireSceneText(scene,'editor-json',{}, {resources,signal}),async(_lease,context)=>{
          consuming.release();await consumerDelivery.promise;if(context.isCurrent())published++
        }))
      }}>Run async text consumer</button><button disabled={!operation.busy} onClick={operation.cancel}>{operation.cancelling?'Cancelling…':'Cancel consumer'}</button></div>
    }
    root=createRoot(host);flushSync(()=>root!.render(<StrictMode><Consumer/></StrictMode>))
    host.querySelector<HTMLButtonElement>('button')!.click();await consuming.promise
    host.querySelectorAll<HTMLButtonElement>('button')[1].click();await until(()=>host.textContent?.includes('Cancelling…')===true)
    check('async text consumer stays queued/active, busy and pinned until actual settlement',resources.getSnapshot().residency.protectedBytes>0&&operation!.busy&&editorOutputResources.getSnapshot().jobs.active===1)
    consumerDoc.abort();flushSync(()=>root!.unmount());root=undefined
    consumerDelivery.release();await Promise.all(operations);unblock=undefined
    check('cancelled/unmounted async consumer drops text and suppresses late publication',published===0&&resources.getSnapshot().residency.chargedBytes===0)
    const download=await acquireTextDownload(scene,'editor-json',{}, {resources})
    const expectedHash=await crypto.subtle.digest('SHA-256',await download.value.blob.arrayBuffer())
    const hash=Array.from(new Uint8Array(expectedHash),value=>value.toString(16).padStart(2,'0')).join('')
    const filename=`chorono-output-native-${Date.now()}.json`
    downloadOutput(download,value=>value.blob,filename);download.release()
    check('actual browser download handoff retains its Blob/source pin',resources.getSnapshot().residency.protectedBytes>0&&assetSourcePool.getSnapshot().ownedUrls>baseline.sources.ownedUrls,{filename,sha256:hash})
    await until(()=>resources.getSnapshot().residency.chargedBytes===0)
    check('actual download handoff releases after its finite grace',assetSourcePool.getSnapshot().ownedUrls===baseline.sources.ownedUrls)
  }catch(failure){error=String(failure)}
  finally{
    unblock?.();if(root)flushSync(()=>root!.unmount());writers.forEach(writer=>writer.dispose())
    await Promise.allSettled(operations)
    await until(()=>resources.getSnapshot().jobs.active===0&&editorOutputResources.getSnapshot().jobs.active===0)
    resources.dispose();await Promise.resolve()
    if(privateRoot&&namespace)await privateRoot.removeEntry(namespace,{recursive:true})
  }
  const final={budget:editorResourceBudget.getSnapshot(),output:resources.getSnapshot(),editorOutput:editorOutputResources.getSnapshot(),sources:assetSourcePool.getSnapshot()}
  rows.push({name:'all native output and source owners return to baseline',passed:final.budget.chargedBytes===baseline.budget.chargedBytes&&final.sources.references===baseline.sources.references&&final.sources.ownedUrls===baseline.sources.ownedUrls,details:final})
  const build=await(await fetch('output-integration-sources.json')).json()
  return {passed:!error&&rows.every(row=>row.passed),error,results:rows,final,build:{bundleSha256:build.bundleSha256,fixtureSha256:build.fixtureSha256},environment:{userAgent:navigator.userAgent,dpr:devicePixelRatio},scope:'Frozen SVG/HTML/runtime text and Four Seasons full JSON/HTML, actual native SVG RGBA, native OPFS write/abort, production StrictMode folder/JSON components and actual download handoff. Write gate follows native write completion before commit. QA input/reference/evidence copies and native internals are outside managed policy. 512 MiB shared output policy plus 768 MiB observed heap guard; not a paired renderer timing/whole-process benchmark. Private test namespace is removed.'}
}

document.getElementById('app')!.innerHTML='<style>body{margin:24px;background:#0b1220;color:#e2e8f0;font:14px system-ui}button{padding:8px 12px}#pictures{display:flex;gap:16px}figure{margin:0}figcaption{padding:8px;color:#94a3b8}pre{white-space:pre-wrap}#ui pre{max-height:250px;overflow:auto}#ui{max-width:800px}</style><h1>Native output integration · OPT29</h1><p>Frozen text/geometry · native file commit/abort · StrictMode · JSON preview · browser download</p><button id="run">Run output integration</button><p id="status">Ready</p><div id="pictures"></div><div id="ui"></div><pre id="summary"></pre><pre id="report" hidden></pre>'
const runButton=document.getElementById('run') as HTMLButtonElement
runButton.onclick=async()=>{
  runButton.disabled=true;document.getElementById('status')!.textContent='Running'
  try{
    const report=await run();document.getElementById('report')!.textContent=JSON.stringify(report,null,2)
    document.getElementById('summary')!.textContent=JSON.stringify({passed:report.passed,error:report.error,checks:report.results.length,peakPolicyBytes:report.final.budget.peakBytes,finalCharge:report.final.budget.chargedBytes,results:report.results.map(row=>({name:row.name,passed:row.passed}))},null,2)
    document.getElementById('status')!.textContent=report.passed?'PASS':'FAIL'
  }catch(error){document.getElementById('report')!.textContent=JSON.stringify({passed:false,error:String(error)});document.getElementById('status')!.textContent='FAIL'}
  finally{runButton.disabled=false}
}

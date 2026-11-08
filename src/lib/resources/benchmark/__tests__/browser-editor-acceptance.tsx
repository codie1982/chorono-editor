import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import EditorPage from '@/app/page'
import {editorResourceBudget} from '@/lib/resources/budget'
import {browserMemoryReader} from '@/lib/resources/memory/BrowserMemoryReader'
import {canvasMemoryTracker} from '@/lib/resources/memory/CanvasMemoryTracker'
import {renderWorkMonitor,type WorkStage} from '@/lib/resources/performance/RenderWorkMonitor'
import {editorOutputResources} from '@/lib/export/resources'
import {assetSourcePool} from '@/lib/asset/sources'
import {summarizeNumbers} from '@/lib/resources/performance/sampleStatistics'
import {until} from '@/lib/resources/testing/nativeSettlement'

/** Standalone acceptance of the actual editor page, not a renderer substitute.
 * Source import, selection and edits are performed through its normal UI.
 * The only automated input is the ordinary transport button's pointer pair.
 * Sampling uses public numeric owners plus DOM transport text; no scene getter,
 * authoring bridge, private React state or forced GC is introduced. QA records
 * are bounded and are outside the application's managed-resource ledger.
 */
async function main():Promise<void>{
  document.title='Chorono automated playback — Four Seasons'
  const mount=document.createElement('div');mount.id='editor';document.body.append(mount)
  const root=createRoot(mount);root.render(createElement(EditorPage))
  const controls=document.createElement('aside')
  controls.style.cssText='position:fixed;right:8px;bottom:8px;z-index:100000;background:#f1f5f9;color:#111827;padding:8px;border:2px solid #334155;font:12px system-ui;max-width:370px'
  controls.innerHTML='<strong>Whole editor acceptance</strong><p id="acceptance-status">Load the exact fixture through File → Open Scene JSON, then select its 48 s timeline.</p><button id="plays">Run 10 plays</button> <button id="manual">Start manual sample</button> <button id="finish" disabled>Finish sample</button> <button id="checkpoint">Checkpoint</button> <button id="unmount">Unmount editor</button><pre id="acceptance-summary" style="max-height:100px;overflow:auto"></pre><pre id="acceptance-report" hidden></pre>'
  document.body.append(controls)
  const labelInput=document.createElement('input');labelInput.placeholder='Sample label';labelInput.setAttribute('aria-label','Sample label')
  controls.prepend(labelInput)
  const loadButton=document.createElement('button');loadButton.textContent='Load exact Four Seasons fixture'
  controls.prepend(loadButton)
  const metadata=await(await fetch('editor-acceptance-sources.json')).json()
  const status=controls.querySelector('#acceptance-status')!
  const summary=controls.querySelector('#acceptance-summary')!
  const reportNode=controls.querySelector('#acceptance-report')!
  const startButton=controls.querySelector('#plays') as HTMLButtonElement
  const manualButton=controls.querySelector('#manual') as HTMLButtonElement
  const finishButton=controls.querySelector('#finish') as HTMLButtonElement
  const reports:unknown[]=[],checkpoints:unknown[]=[]
  let active=false,automatic=false,completed=0,started=0,lastRaf=0,frame=0
  let timer:ReturnType<typeof setInterval>|null=null
  let samples:ReturnType<typeof sample>[]=[],gaps:number[]=[],hidden=0
  let label=''
  let workSamples:Record<WorkStage,{atMs:number;ms:number}[]>={viewport:[],evaluation:[]}
  let releaseWork:(()=>void)[]=[]
  let interrupted:string|null=null
  let timeNode:HTMLSpanElement|null=null,transport:HTMLButtonElement|null=null

  /** Inject only the file-picker handoff to avoid a shared native dialog racing
   * other browser tasks. Bytes are fetched/hash-verified before constructing the
   * real File; production Open Scene JSON parsing/admission/reset stays intact.
   * The temporary click adapter restores synchronously in finally. The earlier
   * native-picker run is retained separately; this is not a picker UI test.
   */
  loadButton.onclick=async()=>{
    loadButton.disabled=true
    try{
      if(active)throw new Error('Stop sampling before changing the fixture')
      const response=await fetch('four-seasons.chorono.json');if(!response.ok)throw new Error('Fixture unavailable')
      const bytes=await response.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes)
      const hex=Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('')
      if(hex!==metadata.fixture.sha256)throw new Error('Fixture hash mismatch')
      const file=new File([bytes],'chorono-four-seasons-48s-v1.chorono.json',{type:'application/json'})
      mount.querySelector<HTMLButtonElement>('button[title="Menu"]')!.click()
      const findOpen=()=>Array.from(mount.querySelectorAll('button')).find(button=>button.textContent?.includes('Open Scene JSON'))
      await until(()=>!!findOpen(),{label:'Production File menu'})
      const nativeClick=HTMLInputElement.prototype.click
      try{
        HTMLInputElement.prototype.click=function(){
          if(this.type!=='file'){nativeClick.call(this);return}
          const transfer=new DataTransfer();transfer.items.add(file);this.files=transfer.files
          this.dispatchEvent(new Event('change',{bubbles:true}))
        }
        findOpen()!.click()
      }finally{HTMLInputElement.prototype.click=nativeClick}
      await until(()=>!!Array.from(mount.querySelectorAll('button')).find(button=>button.textContent==='chorono_living_seasons_48s'),{label:'Actual editor scene import'})
      status.textContent=`Exact fixture loaded · ${metadata.fixture.layers} source layers · select 48 s timeline`
    }catch(error){status.textContent=`ERROR: ${String(error)}`}finally{loadButton.disabled=false}
  }

  /** Numeric snapshots neither retain the document nor acquire cache pins. */
  function sample(){
    return {atMs:performance.now()-started,transport:timeNode?.textContent??null,
      playing:transport?.textContent?.includes('Pause')??false,
      visibility:document.visibilityState,budget:editorResourceBudget.getSnapshot(),
      heap:browserMemoryReader.getSnapshot().heap,canvases:canvasMemoryTracker.getSnapshot(),
      canvasRegistrations:canvasMemoryTracker.getRegistrationCount(),
      work:renderWorkMonitor.getSnapshot(),output:editorOutputResources.getSnapshot(),
      sources:assetSourcePool.getSnapshot(),mountedElements:mount.getElementsByTagName('*').length}
  }

  /** Publish bounded evidence as DOM text for native UI automation to retrieve. */
  function publish(){
    reportNode.textContent=JSON.stringify({kind:'whole-editor-acceptance',build:metadata,
      environment:{userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight}},
      scope:'Actual production EditorPage/React/CSS. No Next backend or MCP connection in this static QA host. Public counters sampled once per second; RAF includes observer overhead. Native process RSS is a separate receipt. No forced GC.',
      reports,checkpoints},null,2)
  }

  /** Same pointer down/up consumed by the production play button; no clock writes. */
  function play(){
    if(!transport?.isConnected)throw new Error('Production transport is unavailable')
    transport.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1}))
    transport.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:1}))
  }

  /** Stop timers/RAF before reporting. Memory guards are failures, not early passes. */
  function finish(reason:string){
    if(!active)return
    active=false;if(timer!==null)clearInterval(timer);timer=null;cancelAnimationFrame(frame)
    releaseWork.forEach(release=>release());releaseWork=[]
    mount.inert=false
    if(automatic&&!reason.startsWith('INTERRUPTED')&&transport?.textContent?.includes('Pause'))play()
    const result={label,automatic,completed,elapsedMs:performance.now()-started,reason,hiddenSamples:hidden,
      raf:summarizeNumbers(gaps),work:{viewport:summarizeNumbers(workSamples.viewport.map(row=>row.ms)),
        evaluation:summarizeNumbers(workSamples.evaluation.map(row=>row.ms))},workSamples,samples,ended:sample()}
    reports.push(result);samples=[];gaps=[]
    workSamples={viewport:[],evaluation:[]}
    startButton.disabled=manualButton.disabled=false;finishButton.disabled=true
    status.textContent=`${reason}: ${completed}/10 plays · ${(result.elapsedMs/1000).toFixed(1)} s`
    summary.textContent=JSON.stringify({reason,completed,raf:result.raf,
      finalChargedMiB:result.ended.budget.chargedBytes/1024**2,
      finalHeapMiB:result.ended.heap?result.ended.heap.used/1024**2:null},null,2)
    publish()
  }

  /** Collect whole-page presented cadence, bounded to 100000 intervals. */
  function raf(now:number){
    if(!active)return
    if(lastRaf&&gaps.length<100000)gaps.push(now-lastRaf)
    lastRaf=now;frame=requestAnimationFrame(raf)
  }

  /** Verify the visible 48 s transport before starting; fixture selection is native UI. */
  function begin(auto:boolean){
    try{
      transport=mount.querySelector('button[title^="Play / Pause"]')
      timeNode=Array.from(mount.querySelectorAll('span')).find(node=>/^\d+ \/ 48000 ms$/.test(node.textContent??''))??null
      if(!transport||!timeNode)throw new Error('Select the full 48000 ms timeline first')
      if(auto&&!timeNode.textContent!.startsWith('0 /'))throw new Error('Seek to 0 before the ten-play run')
      if(transport.textContent?.includes('Pause'))throw new Error('Pause the editor before starting a sample')
      active=true;automatic=auto;completed=0;started=performance.now();lastRaf=0;hidden=0;samples=[];gaps=[];interrupted=null
      label=labelInput.value.trim();workSamples={viewport:[],evaluation:[]}
      // Public completed-work notifications record each interval once. These
      // bounded numeric probes include their small synchronous observer cost;
      // they do not read React state or sample overlapping five-second p95s.
      releaseWork=(['viewport','evaluation'] as const).map(stage=>renderWorkMonitor.subscribe(stage,()=>{
        const value=renderWorkMonitor.getLastSample(stage)
        if(value&&workSamples[stage].length<100000)workSamples[stage].push({atMs:value.at-started,ms:value.ms})
      }))
      mount.inert=auto
      startButton.disabled=manualButton.disabled=true;finishButton.disabled=false
      timer=setInterval(()=>{
        if(!active)return
        if(interrupted){finish(`INTERRUPTED ${interrupted}`);return}
        if(!timeNode?.isConnected||!transport?.isConnected){finish('INTERRUPTED transport remounted');return}
        const row=sample();samples.push(row)
        if(document.hidden)hidden++
        if(automatic&&document.hidden){finish('INTERRUPTED hidden document');return}
        if(row.budget.chargedBytes>512*1024**2||row.heap&&row.heap.used>768*1024**2){finish('FAIL memory guard');return}
        if(samples.length>=1200){finish('FAIL 20 minute sample limit');return}
        if(automatic&&!row.playing&&/^48000 \/ 48000 ms$/.test(row.transport??'')){
          completed++;checkpoints.push({label:`play-${completed}`,sample:row})
          if(completed===10){finish(hidden?'FAIL hidden document':'COMPLETE');return}
          play()
        }
        else if(automatic&&!row.playing&&samples.length>2){finish(`INTERRUPTED unexpected pause at ${row.transport}`);return}
        status.textContent=`Sampling ${automatic?'playback (editor controls locked)':'manual'} · ${completed}/10 · ${Math.round(row.atMs/1000)} s`
        summary.textContent=`Policy ${(row.budget.chargedBytes/1024**2).toFixed(2)} MiB · heap ${row.heap?(row.heap.used/1024**2).toFixed(2):'unavailable'} MiB · ${row.mountedElements} DOM elements`
      },1000)
      frame=requestAnimationFrame(raf);if(auto)play()
    }catch(error){status.textContent=`ERROR: ${String(error)}`;if(active)finish('FAIL start')}
  }
  /** Trusted editor input invalidates controlled playback without overriding it. */
  const editorInput=(event:PointerEvent)=>{if(active&&automatic&&event.isTrusted)interrupted='native editor input'}
  mount.addEventListener('pointerdown',editorInput,true)
  startButton.onclick=()=>begin(true);manualButton.onclick=()=>begin(false)
  finishButton.onclick=()=>finish('MANUAL COMPLETE')
  controls.querySelector<HTMLButtonElement>('#checkpoint')!.onclick=()=>{
    if(checkpoints.length>=200){status.textContent='Checkpoint capacity reached';return}
    checkpoints.push({label:`manual-${checkpoints.length}`,sample:sample()});publish()
    status.textContent=`Checkpoint ${checkpoints.length} captured`
  }
  controls.querySelector<HTMLButtonElement>('#unmount')!.onclick=()=>{
    finish('UNMOUNT');root.unmount()
    setTimeout(()=>{editorResourceBudget.reclaimIdle();checkpoints.push({label:'unmounted-idle',sample:sample()});publish();status.textContent='Editor unmounted; idle ownership captured'},2250)
  }
  window.addEventListener('pagehide',()=>{if(timer!==null)clearInterval(timer);cancelAnimationFrame(frame);releaseWork.forEach(release=>release());mount.removeEventListener('pointerdown',editorInput,true);root.unmount()},{once:true})
}
void main()

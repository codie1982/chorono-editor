import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import type {AssetCache} from '@/app/hooks/useAssetCache'
import type {AudioEngineHandle} from '@/app/hooks/useAudioEngine'
import type {ChronoScene} from '@/lib/types'
import {BaselineAssetsBridge} from './BaselineAssetsBridge'
import {BrowserBaselineHost} from './BrowserBaselineHost'
import {BaselineRecorder} from '../BaselineRecorder'
import {DEFAULT_BASELINE_PROTOCOL} from '../types'
import {selectProjection,resetProjectionCounts,projectionCounts} from 'projection-strategy'

/** Same source objects, renderer, canvas and backend for both strategies. The
 * build substitutes only prepareRenderFrame's projection import. The shared
 * production host/recorder preserve timing, guards, ownership and pixel hashing.
 * AA mode selects the identical current function for BOTH sides. No production
 * injection API or authoring path is added. */
async function main(){
 const control=new URL(location.href).searchParams.get('control')==='1'
 document.body.innerHTML=`<style>body{font:14px system-ui;padding:24px;background:#f2f5fa}canvas{width:min(800px,95vw)}pre{white-space:pre-wrap}#report{display:none}</style><h1>Same-realm ${control?'A/A control':'projection comparison'}</h1><p>One source, renderer, canvas and backend · 512 MiB guard · full RGBA checks</p><p id="status">Loading</p><button id="start" disabled>Start comparison</button><canvas id="canvas"></canvas><div id="assets" hidden></div><pre id="summary"></pre><pre id="report"></pre>`
 const response=await fetch('four-seasons.chorono.json'),bytes=await response.arrayBuffer(),scene:ChronoScene=JSON.parse(new TextDecoder().decode(bytes))
 const digest=await crypto.subtle.digest('SHA-256',bytes),sceneSha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
 const build=await(await fetch('same-realm-sources.json')).json(),root=createRoot(document.getElementById('assets')!)
 const [assets,audio]=await new Promise<[AssetCache,AudioEngineHandle]>((resolve,reject)=>root.render(createElement(BaselineAssetsBridge,{scene,onReady:(a,b)=>resolve([a,b]),onError:reject})))
 const host=new BrowserBaselineHost(scene,document.getElementById('canvas') as HTMLCanvasElement,assets,audio)
 const start=document.getElementById('start') as HTMLButtonElement,status=document.getElementById('status')!
 status.textContent='Ready';start.disabled=false
 start.onclick=async()=>{
  start.disabled=true
  const protocol=DEFAULT_BASELINE_PROTOCOL,recorders=[new BaselineRecorder(protocol),new BaselineRecorder(protocol)],pairs=[],checkpoints=[]
  const times=protocol.sampleFractions.map(f=>f*scene.composition.durationMs),controller=new AbortController()
  let reason:string|null=null
  const draw=(side:number,point:number,repetition:number)=>{
   selectProjection(side,control);const row=host.draw(times[point],repetition)
   const stop=recorders[side].memoryStopReason(row.knownBytes,row.heapBytes);if(stop)throw new Error(stop)
   return row
  }
  const started=host.activeNow();let cycle=0
  try{
   while(host.activeNow()-started<protocol.warmupMs){
    const point=cycle%times.length,order=(cycle+Math.floor(cycle/times.length))%2?[1,0]:[0,1]
    for(const side of order)draw(side,point,0)
    cycle++;status.textContent=`Warming ${(host.activeNow()-started).toFixed(0)} / 60000 ms`;await host.nextFrame(controller.signal)
   }
   resetProjectionCounts()
   for(let repetition=0;repetition<protocol.repetitions;repetition++)for(let point=0;point<times.length;point++){
    const order=(repetition+point)%2?[1,0]:[0,1],rows=[]
    for(const side of order){rows[side]=draw(side,point,repetition);recorders[side].record(rows[side])}
    pairs.push({timeMs:times[point],first:order[0]?'after':'before',before:rows[0],after:rows[1]})
    status.textContent=`Sampling ${pairs.length}/60`;await host.nextFrame(controller.signal)
   }
   const counts=projectionCounts()
   if(control?counts.reference!==0||counts.current!==120:counts.reference!==60||counts.current!==60)throw new Error('Projection strategy calls differ from expected draws.')
   for(let point=0;point<times.length;point++){
    draw(0,point,0);const before=await host.checkpoint();draw(1,point,0);const after=await host.checkpoint()
    checkpoints.push({timeMs:times[point],before,after,equal:before===after});if(before!==after)reason='pixel-hash-mismatch'
   }
   const end=host.getSnapshot();await new Promise(resolve=>setTimeout(resolve,2250));const idle=host.getSnapshot()
   const report={kind:'same-realm-render-comparison',status:reason?'incomplete':'complete',reason,control,protocol,build,sceneSha256,warmupPairs:cycle,
    projectionCalls:counts,before:recorders[0].finish(reason),after:recorders[1].finish(reason),pairs,checkpoints,end,idle,
    environment:{userAgent:navigator.userAgent,scope:'one renderer/canvas/backend; only root projection strategy varies',width:innerWidth,height:innerHeight,dpr:devicePixelRatio}}
   document.getElementById('report')!.textContent=JSON.stringify(report,null,2)
   document.getElementById('summary')!.textContent=JSON.stringify({status:report.status,control,projectionCalls:counts,before:report.before.summary,after:report.after.summary},null,2)
   status.textContent=report.status.toUpperCase()
  }catch(error){status.textContent='FAIL';document.getElementById('report')!.textContent=JSON.stringify({status:'incomplete',reason:String(error),pairs})}
  finally{host.dispose();root.unmount()}
 }
}
void main().catch(error=>{document.getElementById('status')!.textContent='FAIL';document.getElementById('report')!.textContent=JSON.stringify({status:'incomplete',reason:String(error)})})

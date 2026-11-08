import { DEFAULT_BASELINE_PROTOCOL } from '../types'
import type { BaselineSample } from '../types'
import { BaselineRecorder } from '../BaselineRecorder'
import { VisibleTimeClock } from '../VisibleTimeClock'

/** Alternates AB/BA across repetitions of each authored time. Separate iframe bundles
 * share the visible-page clock; counters/time readings stay inside each child.
 * This control reduces machine-load drift, not probe or process isolation.
 * Shared active warmup is 60 s for BOTH hosts; per-host frame counts are reported.
 * Bounds/guards/checkpoint times reuse the established sparse protocol. */
async function main(){
 document.body.innerHTML='<style>body{font:14px system-ui;background:#f2f5fa;padding:24px}iframe{width:45%;height:280px;border:1px solid #abc}pre{white-space:pre-wrap}</style><h1>Paired renderer comparison</h1><p id="status">Loading…</p><button id="start" disabled>Start paired comparison</button><div id="frames"></div><pre id="summary"></pre><pre id="report" style="display:none"></pre>'
 const layout=new URL(location.href).searchParams.get('layout')==='reversed'?'reversed':'normal'
 const build=await(await fetch('paired-sources.json')).json()
 const protocol=DEFAULT_BASELINE_PROTOCOL,rec=[new BaselineRecorder(protocol),new BaselineRecorder(protocol)]
 const frames=[document.createElement('iframe'),document.createElement('iframe')],ready=[false,false],hashes=['','']
 const waiting=new Map<number,{source:Window;resolve:(v:unknown)=>void;reject:(e:Error)=>void}>();let next=0
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return
  const i=frames.findIndex(frame=>frame.contentWindow===event.source);if(i<0)return
  if(event.data?.error&&event.data.id===undefined){document.querySelector('#status')!.textContent=event.data.error;return}
  if(event.data?.ready){ready[i]=true;hashes[i]=event.data.sceneSha256;if(ready.every(Boolean)){
   if(hashes[0]!==hashes[1])throw new Error('Paired source hashes differ')
   ;(document.querySelector('#start') as HTMLButtonElement).disabled=false;document.querySelector('#status')!.textContent='Ready'
  }return}
  const pending=waiting.get(event.data?.id);if(!pending||pending.source!==event.source)return
  waiting.delete(event.data.id);if(event.data.error)pending.reject(new Error(event.data.error));else pending.resolve(event.data.result)
 })
 // Reverse creation/load order as well as placement. AB/BA alone cannot
 // cancel systematic realm/creation-order differences (verified by A/A).
 ;(layout==='reversed'?[1,0]:[0,1]).forEach(i=>{const frame=frames[i];frame.src=i?'paired-after.html':'paired-before.html';document.querySelector('#frames')!.append(frame)})
 const request=(i:number,command:string,timeMs=0,repetition=0)=>new Promise<unknown>((resolve,reject)=>{
  const id=++next,source=frames[i].contentWindow!;waiting.set(id,{source,resolve,reject});source.postMessage({id,command,timeMs,repetition},location.origin)
 })
 const start=document.querySelector('#start') as HTMLButtonElement
 start.onclick=async()=>{
  start.disabled=true;const clock=new VisibleTimeClock(!document.hidden,performance.now()),started=performance.now()
  const visibility=()=>clock.setVisible(!document.hidden,performance.now());document.addEventListener('visibilitychange',visibility)
  const pairs:unknown[]=[],warmFrames=[0,0],checkpoints:unknown[]=[],status=document.querySelector('#status')!
  let reason:string|null=null
  const draw=async(i:number,time:number,repetition:number)=>{
   const row=await request(i,'draw',time,repetition) as BaselineSample
   const stop=rec[i].memoryStopReason(row.knownBytes,row.heapBytes);if(stop)throw new Error(stop)
   return row
  }
  try{
   const warmStart=clock.read(performance.now());let cycle=0
   while(clock.read(performance.now())-warmStart<protocol.warmupMs){
    const time=protocol.sampleFractions[cycle%6]*48000,order=cycle%2?[1,0]:[0,1]
    for(const i of order){await draw(i,time,0);warmFrames[i]++}
    cycle++;status.textContent=`Warming ${(clock.read(performance.now())-warmStart).toFixed(0)} / 60000 ms`
    await new Promise(requestAnimationFrame)
   }
   let pair=0
   for(let repetition=0;repetition<protocol.repetitions;repetition++)for(const fraction of protocol.sampleFractions){
    // Six authored times is even: pair parity alone would always give a given
    // time the same source order. Balance both orders at EACH time instead.
    const time=fraction*48000,order=(pair+repetition)%2?[1,0]:[0,1],rows:BaselineSample[]=[]
    for(const i of order){rows[i]=await draw(i,time,repetition);rec[i].record(rows[i])}
    pairs.push({timeMs:time,first:order[0]===0?'before':'after',before:rows[0],after:rows[1]});pair++
    status.textContent=`Sampling ${pair} / 60 pairs`;await new Promise(requestAnimationFrame)
   }
   for(const fraction of protocol.sampleFractions){const time=fraction*48000;const before=await request(0,'hash',time),after=await request(1,'hash',time);checkpoints.push({timeMs:time,before,after,equal:before===after});if(before!==after)reason='pixel-hash-mismatch'}
  }catch(error){reason=String(error)}
  const end=[await request(0,'snapshot'),await request(1,'snapshot')]
  await new Promise(resolve=>setTimeout(resolve,2250))
  const idle=[await request(0,'snapshot'),await request(1,'snapshot')]
  const report={kind:'paired-sparse-baseline',status:reason?'incomplete':'complete',reason,protocol,build,sceneSha256:hashes[0],
   warmup:{sharedActiveMs:60000,frames:warmFrames},before:rec[0].finish(reason),after:rec[1].finish(reason),pairs,checkpoints,end,idle,
   environment:{layout,timingScope:'single-layout; use both layouts for timing comparisons',userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},elapsedMs:performance.now()-started}}
  document.querySelector('#report')!.textContent=JSON.stringify(report,null,2)
  document.querySelector('#summary')!.textContent=JSON.stringify({status:report.status,before:report.before.summary,after:report.after.summary},null,2)
  status.textContent=report.status.toUpperCase();document.removeEventListener('visibilitychange',visibility)
  await request(0,'dispose');await request(1,'dispose')
 }
}
void main()

import {materializeRenderScene as reference} from 'projection-reference'
import {materializeRenderScene as current} from '../materializeOverrides'
import {evaluateTimelines} from '../../evaluator'
import type {ChronoScene} from '../../types'
import {renderSchemas} from '../prepareRenderFrame'
import {VisibleTimeClock} from '../../resources/benchmark/VisibleTimeClock'
import {summarizeNumbers} from '../../resources/performance/sampleStatistics'
import {browserMemoryReader} from '../../resources/memory/BrowserMemoryReader'
import {DEFAULT_BASELINE_PROTOCOL} from '../../resources/benchmark/types'

/** Isolate projection cost with AB/BA in one realm and identical evaluated
 * input maps. This is diagnostic JS wall time, not full-render acceptance.
 * Keep each result until the next draw; never retain a frame history. */
async function run(){
 const scene:ChronoScene=await(await fetch('four-seasons.chorono.json')).json(),times=[0,6000,12000,24000,36000,47999]
 const frames=times.map(time=>evaluateTimelines(scene.timelines,time)),functions=[reference,current],retained=[scene,scene]
 const clock=new VisibleTimeClock(!document.hidden,performance.now()),visibility=()=>clock.setVisible(!document.hidden,performance.now())
 document.addEventListener('visibilitychange',visibility)
 const pairs:Array<{timeMs:number;before:number;after:number;first:string}>=[],samples:[number[],number[]]=[[],[]]
 const draw=(which:number,frame:number)=>{const start=performance.now();retained[which]=functions[which](scene,frames[frame],renderSchemas);return performance.now()-start}
 try{
  const start=clock.read(performance.now());let i=0
  while(clock.read(performance.now())-start<5000){draw(i%2,i%6);draw(1-i%2,i%6);i++;await new Promise(requestAnimationFrame)}
  for(let repetition=0;repetition<10;repetition++)for(let point=0;point<6;point++){
   const order=(repetition+point)%2?[1,0]:[0,1],values=[0,0]
   for(const which of order){values[which]=draw(which,point);samples[which].push(values[which])}
   pairs.push({timeMs:times[point],before:values[0],after:values[1],first:order[0]?'after':'before'})
   const heap=browserMemoryReader.getSnapshot().heap?.used
   if(heap!==undefined&&heap>DEFAULT_BASELINE_PROTOCOL.heapByteLimit)throw new Error('Projection heap guard exceeded')
   document.querySelector('#status')!.textContent=`Sampling ${pairs.length}/60`;await new Promise(requestAnimationFrame)
  }
  const equal=JSON.stringify(retained[0])===JSON.stringify(retained[1])
  const report={kind:'same-realm-projection-diagnostic',passed:equal,before:summarizeNumbers(samples[0]),after:summarizeNumbers(samples[1]),pairs,equal,layerCount:scene.layers.length,environment:{userAgent:navigator.userAgent}}
  document.querySelector('#report')!.textContent=JSON.stringify(report,null,2);document.querySelector('#status')!.textContent=equal?'PASS':'FAIL'
 }finally{document.removeEventListener('visibilitychange',visibility)}
}
document.body.innerHTML='<style>body{font:14px system-ui;padding:24px}pre{white-space:pre-wrap}</style><h1>Projection cost · same realm AB/BA</h1><p>Diagnostic only: native frame/evaluator work is excluded. Five seconds warmup and 60 balanced pairs.</p><p id="status">Warming</p><pre id="report"></pre>'
void run().catch(error=>{document.querySelector('#status')!.textContent='FAIL';document.querySelector('#report')!.textContent=JSON.stringify({passed:false,error:String(error)})})

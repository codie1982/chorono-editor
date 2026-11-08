import type {ChronoScene} from '@/lib/types'
import {evaluateTimelines} from '@/lib/evaluator'
import {CanvasRenderer} from '@/lib/render/CanvasRenderer'
import {CanvasSurfacePool} from '@/lib/render/resources/CanvasSurfacePool'
import {readStages,resetStages} from './stageTrace'
import {createElement} from 'react'
import {createRoot} from 'react-dom/client'
import {BaselineAssetsBridge} from './BaselineAssetsBridge'
import type {AssetCache} from '@/app/hooks/useAssetCache'
import {ProjectResourceMonitor} from '../../monitor/ProjectResourceMonitor'
import {editorResourceBudget} from '../../budget'
import {DEFAULT_BASELINE_PROTOCOL} from '../types'
declare const __PROFILE_MODE__: 'roi'|'frame'

/** Fixed instrumented workload. No authoring or asset mutation. Inclusive
 * timings have probe overhead and are kept apart from sparse acceptance runs. */
async function main(){
 document.body.innerHTML='<style>body{font:14px system-ui;padding:24px}pre{white-space:pre-wrap;max-height:650px;overflow:auto}canvas{width:480px}</style><h1>Instrumented frame stage profile</h1><p>Inclusive wall times include probe overhead. This is not acceptance CPU or FPS.</p><p id="status">Running…</p><div id="examples"></div><pre id="report"></pre>'
 const scene:ChronoScene=await(await fetch('four-seasons.chorono.json')).json(),results=[]
 const mount=document.createElement('div');mount.hidden=true;document.body.append(mount)
 const root=createRoot(mount)
 const assets=await new Promise<AssetCache>((resolve,reject)=>root.render(createElement(BaselineAssetsBridge,
  {scene,onReady:loaded=>resolve(loaded),onError:reject})))
 const metadata=await(await fetch('stage-profile-sources.json')).json()
 for(const roi of (__PROFILE_MODE__==='frame'?[true]:[false,true])){
  const canvas=document.createElement('canvas');canvas.width=scene.composition.width;canvas.height=scene.composition.height
  const pool=new CanvasSurfacePool({budget:editorResourceBudget}),renderer=new CanvasRenderer(pool,undefined,roi),context=canvas.getContext('2d')!
  const monitor=new ProjectResourceMonitor({scene,media:assets,isPlaying:false},{pool})
  const times=[0,6000,12000,24000,36000,47999]
  const draw=(time:number)=>{
   const start=performance.now(),overrides=evaluateTimelines(scene.timelines,time),evaluated=performance.now()
   renderer.render(context,scene,time,null,assets,{overrides,renderMode:'preview'})
   return {evaluationMs:evaluated-start,renderMs:performance.now()-evaluated}
  }
  for(const time of times){draw(time);await new Promise(requestAnimationFrame)}
  if(__PROFILE_MODE__==='frame'){
   const until=performance.now()+10000
   while(performance.now()<until){draw(times[0]);await new Promise(requestAnimationFrame)}
  }
  resetStages();const frames=[]
  for(let i=0;i<3;i++)for(const time of times){
   if(__PROFILE_MODE__==='frame')resetStages()
   const start=performance.now(),timing=draw(time),ms=performance.now()-start
   const memory=monitor.getSnapshot()
   if(memory.knownBytes>DEFAULT_BASELINE_PROTOCOL.knownByteLimit||(memory.browser.heap?.used??0)>DEFAULT_BASELINE_PROTOCOL.heapByteLimit)throw new Error('Profile memory guard exceeded')
   frames.push({time,ms,...timing,...(__PROFILE_MODE__==='frame'?{stages:readStages()}:{}),knownBytes:memory.knownBytes});await new Promise(requestAnimationFrame)
  }
  const copy=document.createElement('canvas');copy.width=480;copy.height=Math.round(480*canvas.height/canvas.width);copy.getContext('2d')!.drawImage(canvas,0,0,copy.width,copy.height);document.querySelector('#examples')!.append(copy)
  results.push({roi,frames,stages:readStages(),pool:pool.getSnapshot()});pool.dispose();canvas.width=canvas.height=0
 }
 document.querySelector('#report')!.textContent=JSON.stringify({kind:'instrumented-inclusive-profile',mode:__PROFILE_MODE__,metadata,results},null,2)
 document.querySelector('#status')!.textContent='COMPLETE'
 root.unmount()
}
void main().catch(error=>{document.querySelector('#status')!.textContent='ERROR';document.querySelector('#report')!.textContent=String(error)})

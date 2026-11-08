import type { ChronoScene } from '@/lib/types'
import { BrowserBaselineHost } from './BrowserBaselineHost'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { BaselineAssetsBridge } from './BaselineAssetsBridge'

/** Isolated immutable Four Seasons renderer. Before/after scripts are built
 * from distinct source snapshots, in separate iframe globals/GPU contexts.
 * The only commands are bounded test frames, hashes, snapshots and disposal;
 * no scene mutation, authoring bridge or application credential is exposed. */
async function main() {
  const response=await fetch('paired-four-seasons.chorono.json')
  if(!response.ok)throw new Error(`Paired fixture unavailable: ${response.status}`)
  const bytes=await response.arrayBuffer()
  const scene:ChronoScene=JSON.parse(new TextDecoder().decode(bytes))
  const hash=await crypto.subtle.digest('SHA-256',bytes)
  const sceneSha256=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')
  const canvas=document.createElement('canvas');canvas.style.width='100%';document.body.append(canvas)
  const mount=document.createElement('div');mount.hidden=true;document.body.append(mount)
  const root=createRoot(mount)
  let started=false
  root.render(createElement(BaselineAssetsBridge,{scene,onReady(assets,audio){
  if(started)return
  started=true
  const host=new BrowserBaselineHost(scene,canvas,assets,audio)
  window.addEventListener('message',async event=>{
    if(event.source!==parent||event.origin!==location.origin)return
    const {id,command,timeMs=0,repetition=0}=event.data??{}
    if(!Number.isSafeInteger(id)||!Number.isFinite(timeMs)||timeMs<0||timeMs>scene.composition.durationMs)return
    try{
      let result:unknown
      if(command==='draw')result=host.draw(timeMs,repetition)
      else if(command==='hash'){host.draw(timeMs,0);result=await host.checkpoint()}
      else if(command==='snapshot')result=host.getSnapshot()
      else if(command==='dispose'){host.dispose();root.unmount();result=true}
      else return
      parent.postMessage({id,result},location.origin)
    }catch(error){parent.postMessage({id,error:String(error)},location.origin)}
  })
  parent.postMessage({ready:true,sceneSha256},location.origin)
  },onError(error){parent.postMessage({error:String(error)},location.origin)}}))
}
void main().catch(error=>parent.postMessage({error:String(error)},location.origin))

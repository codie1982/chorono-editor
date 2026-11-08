import type {ChronoScene} from '@/lib/types'
import {canvasRenderer} from '@/lib/render/CanvasRenderer'
import {withMediaFrame} from '@/lib/render/media/withMediaFrame'

/** Representative production-path frame, without the comparison strategy.
 * Await independent real font/media pins and expose the full RGBA hash. This
 * visual is outside timing measurements and never edits a user's document. */
async function main(){
 document.body.innerHTML='<style>body{font:15px system-ui;padding:24px;background:#f2f5fa}canvas{width:min(960px,95vw)}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Four Seasons · production frame</h1><p>6000 ms · actual renderer and independent media/font preparation</p><p id="status">Rendering</p><canvas id="canvas"></canvas><pre id="report"></pre>'
 const scene:ChronoScene=await(await fetch('four-seasons.chorono.json')).json(),canvas=document.getElementById('canvas') as HTMLCanvasElement
 canvas.width=scene.composition.width;canvas.height=scene.composition.height
 const context=canvas.getContext('2d')!
 await withMediaFrame(scene,6000,context,{},(assets,overrides)=>canvasRenderer.render(context,scene,6000,null,assets,{overrides,renderMode:'preview'}))
 const digest=await crypto.subtle.digest('SHA-256',context.getImageData(0,0,canvas.width,canvas.height).data.buffer as ArrayBuffer)
 const rgbaSha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
 document.getElementById('report')!.textContent=JSON.stringify({timeMs:6000,width:canvas.width,height:canvas.height,rgbaSha256},null,2)
 document.getElementById('status')!.textContent='COMPLETE'
}
void main().catch(error=>{document.getElementById('status')!.textContent='FAIL';document.getElementById('report')!.textContent=String(error)})

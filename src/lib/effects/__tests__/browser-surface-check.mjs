import { effectRegistry } from '../index'
import { CanvasSurfacePool } from '@/lib/render/resources/CanvasSurfacePool'
import { CanvasSurfaceScope } from '@/lib/render/resources/CanvasSurfaceScope'
import { gpuImageEffects } from '@/lib/render/gpu/effects/GPUImageEffects'
import { blurEffect } from './reference/BlurEffect.ts.snapshot'
import { glowEffect } from './reference/GlowEffect.ts.snapshot'
import { shadowEffect } from './reference/ShadowEffect.ts.snapshot'
import { innerShadowEffect } from './reference/InnerShadowEffect.ts.snapshot'
import { innerGlowEffect } from './reference/InnerGlowEffect.ts.snapshot'
import { tintEffect } from './reference/TintEffect.ts.snapshot'
import { vignetteEffect } from './reference/VignetteEffect.ts.snapshot'

const references = [blurEffect,glowEffect,shadowEffect,innerShadowEffect,innerGlowEffect,tintEffect,vignetteEffect]

/** Real transparent RGBA input with gradient, partial alpha, clipping and antialiased rotation. */
function inputCanvas() {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=96
  const c=canvas.getContext('2d');c.save();c.translate(11,8);c.rotate(0.13)
  c.beginPath();c.rect(4,2,96,72);c.clip()
  const g=c.createLinearGradient(0,0,100,70);g.addColorStop(0,'#ed6c28');g.addColorStop(1,'#368ee8')
  c.fillStyle=g;c.globalAlpha=0.83;c.fillRect(0,0,110,80);c.restore()
  return canvas
}

/** Reads a disposable CPU copy, keeping input/effect canvases out of readback backend promotion. */
function pixels(source) {
  const reader=document.createElement('canvas');reader.width=128;reader.height=96
  try {
    const context=reader.getContext('2d',{willReadFrequently:true})
    context.drawImage(source,0,0)
    return context.getImageData(0,0,128,96).data
  } finally {reader.width=reader.height=0}
}

/** Exact changed-channel count; source render canvases are never read directly. */
function compare(a,b) {
  const left=pixels(a),right=pixels(b)
  let changed=0
  for(let i=0;i<left.length;i++) if(left[i]!==right[i])changed++
  return changed
}

/** Frozen old algorithms preserve a native pre-pool reference; this harness is never production code. */
async function check() {
  document.title='Chorono effect surface regression'
  document.body.innerHTML='<style>body{font:15px system-ui;margin:28px;background:#f3f5f7;color:#17212b}pre{white-space:pre-wrap;background:white;padding:16px}#examples{display:flex;gap:16px}canvas{background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 0/16px 16px}</style><h1>Effect surface pool — native regression</h1><p id="status">Running native comparisons…</p><div id="examples"></div><pre id="results"></pre>'
  const pool=new CanvasSurfacePool({maxBytes:4*128*96*4})
  const input=inputCanvas(),results=[]
  const selfReadbackDifference=compare(input,input)
  const originalBlur=gpuImageEffects.blur
  let gpuCalls=0
  try {
    for(const mode of ['css','gpu-auto']) {
      gpuImageEffects.blur=mode==='css'?()=>null:function(...args){const result=originalBlur.apply(this,args);if(result)gpuCalls++;return result}
      for(const reference of references) for(const variant of ['normal','zero','offset']) {
        const effect={id:'test',type:reference.type,enabled:true,params:{
          radius:variant==='zero'?0:5,blur:variant==='zero'?0:4,color:'#6840b8',
          opacity:variant==='zero'?0:0.64,intensity:variant==='zero'?0:0.7,
          strength:variant==='zero'?0:0.48,blend:'overlay',innerStop:0.3,
          offsetX:variant==='offset'?-7:3,offsetY:variant==='offset'?6:2,
        }}
        const expected=reference.apply(input,effect),scope=new CanvasSurfaceScope(pool)
        try {
          const actual=effectRegistry.get(reference.type).apply(input,effect,scope)
          results.push({mode,type:reference.type,variant,changedChannels:compare(expected,actual)})
          if(mode==='gpu-auto'&&variant==='normal'&&reference.type==='shadow') {
            for(const [label,source] of [['Before',expected],['Pooled',actual]]) {
              const block=document.createElement('figure'),caption=document.createElement('figcaption'),copy=document.createElement('canvas')
              caption.textContent=label;copy.width=128;copy.height=96;copy.getContext('2d').drawImage(source,0,0)
              block.append(caption,copy);document.getElementById('examples').append(block)
            }
          }
        } finally {
          scope.dispose()
          if(expected!==input)expected.width=expected.height=0
        }
      }
      const chain=references.map(r=>({id:r.type,type:r.type,enabled:true,params:{radius:3,blur:4}}))
      let expected=input
      for(const effect of chain) {
        const next=references.find(r=>r.type===effect.type).apply(expected,effect)
        if(expected!==input&&expected!==next)expected.width=expected.height=0
        expected=next
      }
      const scope=new CanvasSurfaceScope(pool)
      try {
        const actual=effectRegistry.applyChain(input,chain,scope)
        results.push({mode,type:'seven-effect-chain',changedChannels:compare(expected,actual)})
        scope.release(actual)
        for(let i=0;i<60;i++) {const frame=effectRegistry.applyChain(input,chain,scope);scope.release(frame)}
      } finally {scope.dispose();if(expected!==input)expected.width=expected.height=0}
    }
    const beforeIdle=pool.getSnapshot()
    await new Promise(resolve=>setTimeout(resolve,2250))
    const afterIdle=pool.getSnapshot()
    const passed=selfReadbackDifference===0&&results.every(r=>r.changedChannels===0)&&beforeIdle.activeBytes===0&&beforeIdle.allocations<=3&&afterIdle.residentBytes===0
    document.getElementById('status').textContent=passed?'PASS — exact native pixels; bounded reuse; idle released':'FAIL'
    document.getElementById('results').textContent=JSON.stringify({passed,results,selfReadbackDifference,readback:'disposable willReadFrequently copies; render canvases unmodified',gpuCalls,beforeIdle,afterIdle},null,2)
  } finally {gpuImageEffects.blur=originalBlur;pool.dispose();input.width=input.height=0}
}
void check().catch(error=>{document.getElementById('status').textContent='FAIL';document.getElementById('results').textContent=String(error)})

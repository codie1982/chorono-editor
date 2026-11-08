import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { Layer, PluginEffect, MaskDefinition } from '@/lib/types'
import { CanvasRenderer } from '../../CanvasRenderer'
import { CanvasSurfacePool } from '../CanvasSurfacePool'
import { createOffscreen } from '../../OffscreenCanvasCache'
import { gpuImageEffects } from '../../gpu/effects/GPUImageEffects'
import { compareLodPixels } from '@/lib/resources/benchmark/__tests__/compareLodPixels'

/** Disposable software fixtures; do not mutate any portable project. */
function shape(id='host',x=130,y=90):Layer {
  return {...newRectLayer(),id,name:id,size:{width:54,height:37},
    transform:{x,y,scaleX:1,scaleY:1,rotationDeg:0,anchorX:0,anchorY:0},
    style:{fill:{type:'solid',color:'#3988df',opacity:76},cornerRadius:7}}
}
function effect(type:string,params:Record<string,unknown>={}):PluginEffect {
  return {id:type,type,enabled:true,params}
}
/** Declared before the first run: <=2 code values and RMS <=0.25 on the
 * composited full-resolution frame. No spatial crop or downsample hides errors.
 * Reports exact changed channels too. GPU normalized UV roundoff may differ
 * with target extent; masks/tint with no blur are required to match exactly. */
function compare(reference:HTMLCanvasElement,actual:HTMLCanvasElement) { return compareLodPixels(reference,actual,1) }

/** Exercises positive ROI, conservative full-domain fallback, transformed and
 * feathered masks, viewport independence, current-frame edits and ownership. */
async function check() {
  document.body.innerHTML='<style>body{font:15px system-ui;padding:24px;background:#f1f4f8;color:#152437}pre{white-space:pre-wrap}#examples{display:flex;gap:16px;flex-wrap:wrap}</style><h1>Mask / effect ROI — native regression</h1><p id="status">Running…</p><div id="examples"></div><pre id="report"></pre>'
  const results:Record<string,unknown>[]=[],pools:CanvasSurfacePool[]=[]
  const original=gpuImageEffects.blur
  const originalCapability=gpuImageEffects.supportsRegionBlur
  let gpuCalls=0
  const run=(mode:string,name:string,layers:Layer[],expectCrop=true,exact=false,background='#e8edf3',timeMs=200)=>{
    if(mode!=='gpu-loss'&&!gpuImageEffects.supportsRegionBlur()&&layers.some(layer=>layer.effectsChain?.some(effect=>effect.enabled&&['blur','glow','shadow'].includes(effect.type))))expectCrop=false
    const scene=emptyScene();scene.composition={...scene.composition,width:384,height:256,backgroundColor:background};scene.layers=layers
    const outputs=[false,true].map(optimize=>{
      const sizes:{width:number;height:number}[]=[]
      const pool=new CanvasSurfacePool({maxBytes:128*1024**2,createCanvas:(width,height)=>{
        sizes.push({width,height});return createOffscreen(width,height)
      }})
      pools.push(pool)
      const output=document.createElement('canvas');output.width=384;output.height=256
      new CanvasRenderer(pool,undefined,optimize).render(output.getContext('2d')!,scene,timeMs,null,new Map(),{renderMode:'preview'})
      return {output,sizes,snapshot:pool.getSnapshot()}
    })
    const [reference,actual]=outputs,quality=compare(reference.output,actual.output)
    const cropped=actual.sizes.some(size=>size.width*size.height<384*256)
    const passed=quality.maxError<=2&&quality.rmse<=0.25&&(!exact||quality.changedPixels===0)
      &&cropped===expectCrop&&actual.snapshot.activeBytes===0
    results.push({mode,name,passed,expectCrop,cropped,quality,reference:reference.snapshot,actual:actual.snapshot,sizes:actual.sizes})
    if(mode==='gpu-auto'&&name==='shadow fractional offset') {
      for(const [label,item] of [['Full composition',reference],['ROI',actual]] as const) {
        const block=document.createElement('figure'),caption=document.createElement('figcaption')
        caption.textContent=label;block.append(caption,item.output);document.querySelector('#examples')!.append(block)
      }
    } else outputs.forEach(item=>{item.output.width=item.output.height=0})
  }
  try {
    for(const mode of ['css','gpu-auto']) {
      gpuImageEffects.supportsRegionBlur=mode==='css'?()=>false:()=>originalCapability.call(gpuImageEffects)
      gpuImageEffects.blur=mode==='css'?()=>null:function(...args){const result=original.apply(gpuImageEffects,args);if(result)gpuCalls++;return result}
      for(const type of ['blur','glow','shadow','tint','innerGlow','innerShadow','vignette']) {
        const host=shape();host.effectsChain=[effect(type,{radius:4,blur:3,color:'#304c8a',intensity:0.8,strength:0.6})]
        run(mode,type,[host],!['innerGlow','innerShadow','vignette'].includes(type),type==='tint')
      }
      const shifted=shape();shifted.effectsChain=[effect('shadow',{blur:5,offsetX:-12.5,offsetY:7.25})]
      run(mode,'shadow fractional offset',[shifted])
      const chained=shape();chained.effectsChain=[effect('shadow',{blur:3,offsetX:9}),effect('glow',{radius:5}),effect('blur',{radius:4}),effect('tint')]
      run(mode,'ordered local chain',[chained])
      for(const maskMode of ['add','subtract','intersect'] as const) for(const inverted of [false,true]) for(const feather of [0,5]) {
        const host=shape(),mask=shape('mask',151,101);mask.size={width:25,height:40};mask.transform.rotationDeg=13
        host.masks=[{id:'m',maskLayerId:'mask',mode:maskMode,inverted,feather,opacity:0.7}]
        run(mode,`${maskMode} invert=${inverted} feather=${feather}`,[host,mask],true,feather===0)
      }
      const missing=shape();missing.masks=[{id:'m',maskLayerId:'missing',mode:'add'}]
      run(mode,'missing mask unchanged',[missing],true,true)
      const parent={...shape('parent',40,25),type:'group' as const},child=shape('child',72,53)
      parent.transform.rotationDeg=11;parent.transform.scaleX=1.4;parent.transform.scaleY=0.8;parent.opacity=0.55
      child.parentId=parent.id;child.transform.rotationDeg=-27;child.transform.scaleX=-1
      child.effectsChain=[effect('shadow',{blur:3,offsetX:7.5,offsetY:-3})]
      run(mode,'nested rotated reflected effect',[parent,child])
      const group={...shape('group',35,31),type:'group' as const,effectsChain:[effect('glow',{radius:4})]}
      const a=shape('a',45,30),b=shape('b',120,70);a.parentId=b.parentId=group.id;b.opacity=0.3
      run(mode,'group child union',[group,a,b])
      a.effectsChain=[effect('blur',{radius:2})]
      run(mode,'nested offscreen parent falls back',[group,a,b]) // Child still crops.
      const edge=shape('edge',-10,8);edge.effectsChain=[effect('shadow',{blur:4,offsetX:9,offsetY:2})]
      run(mode,'composition edge halo',[edge])
      const legacy=shape();legacy.effects={blur:3};legacy.masks=[{id:'m',maskLayerId:'mask',mode:'subtract',feather:4}]
      run(mode,'legacy blur and feather input',[legacy,shape('mask',145,110)])
      const text={...shape('text'),type:'text' as const,text:{value:'Ink',fontSize:22,fontFamily:'sans-serif',color:'#fff'},effectsChain:[effect('blur',{radius:3})]}
      run(mode,'unknown text ink full domain',[text],false)
      const alpha=shape();alpha.effectsChain=[effect('glow',{radius:6})]
      run(mode,'alpha on dark background',[alpha],true,false,'#101523')
    }
    gpuImageEffects.supportsRegionBlur=()=>true;gpuImageEffects.blur=()=>null
    const lost=shape();lost.effectsChain=[effect('shadow',{blur:4})]
    run('gpu-loss','mid-pass fallback redraws full composition',[lost],true,true)
    const beforeIdle=pools.map(pool=>pool.getSnapshot())
    await new Promise(resolve=>setTimeout(resolve,2250))
    const idleReleased=pools.every(pool=>pool.getSnapshot().residentBytes===0)
    const passed=results.every(row=>row.passed)&&idleReleased
    document.querySelector('#status')!.textContent=passed?'PASS':'FAIL'
    document.querySelector('#report')!.textContent=JSON.stringify({passed,results,gpuCalls,idleReleased,beforeIdle},null,2)
  } finally {gpuImageEffects.blur=original;gpuImageEffects.supportsRegionBlur=originalCapability;pools.forEach(pool=>pool.dispose())}
}
void check().catch(error=>{document.querySelector('#status')!.textContent='FAIL';document.querySelector('#report')!.textContent=String(error)})

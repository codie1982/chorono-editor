import '../../registry/bootstrap'
import {emptyScene,newRectLayer} from '../../defaults'
import {acquireRasterImage} from '../raster/RasterExportEngine'
import {OutputResources} from '../resources'
import {renderSurfacePool} from '../../render/resources/CanvasSurfacePool'
import {editorResourceBudget} from '../../resources/budget'

/** Real Canvas2D/native PNG/JPEG contract. Evidence bitmaps are QA-owned and
 * explicitly destroyed; source, parameters and all managed result pins survive
 * only as long as their documented owners. No viewport/LOD options are passed.
 */
async function run(){
  const scene=emptyScene(),rect={...newRectLayer(),id:'rect'},resources=new OutputResources({budget:editorResourceBudget})
  scene.composition={...scene.composition,width:32,height:24,durationMs:1000}
  rect.size={width:4,height:8};rect.transform={x:4,y:4,anchorX:0,anchorY:0,scaleX:1,scaleY:1,rotationDeg:0}
  rect.style={fill:{type:'solid',color:'#ff0000'}}
  scene.layers=[rect];scene.timelines=[{id:'clock',durationMs:1000,autoplay:true,loop:false,tracks:[]}]
  scene.parameters=[{id:'amount',name:'Amount',type:'number',defaultValue:4}]
  rect.propertyExpressions={version:1,fields:{
    'size.width':{resultType:'number',formula:'amount+timeSec',timelineId:'clock',sources:{amount:{propertyPath:'amount',valueType:'number'}}},
    'style.fill.color':{resultType:'color',formula:'rgba(0,255,0,0.5)',timelineId:'clock',sources:{}},
  }}
  const source=JSON.stringify(scene),params=new Map([['amount',12]]),checks:{name:string;passed:boolean;details?:unknown}[]=[]
  const check=(name:string,passed:boolean,details?:unknown)=>{checks.push({name,passed,details});if(!passed)throw new Error(name)}
  const baseline=editorResourceBudget.getSnapshot().chargedBytes
  /** Decode the actual native encoder output and copy one composited pixel. */
  async function pixel(blob:Blob,x:number,y:number){
    const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas')
    canvas.width=bitmap.width;canvas.height=bitmap.height
    try{const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0);return Array.from(context.getImageData(x,y,1,1).data)}
    finally{bitmap.close();canvas.width=0;canvas.height=0}
  }
  try{
    for(const scale of [1,2]){
      const result=await acquireRasterImage(scene,new Map(),{format:'png',timeMs:500,scale,background:'transparent',paramValues:params},{resources})
      try{
        const inside=await pixel(result.value.blob,13*scale,6*scale),outside=await pixel(result.value.blob,24*scale,6*scale)
        check(`PNG ${scale}x uses runtime expression width, color and alpha`,inside[0]===0&&inside[1]===255&&inside[2]===0&&Math.abs(inside[3]-128)<=1&&outside[3]===0,{inside,outside})
        check(`PNG ${scale}x has exact requested target dimensions`,result.value.width===32*scale&&result.value.height===24*scale)
        const image=document.createElement('img');image.src=URL.createObjectURL(result.value.blob);await image.decode();URL.revokeObjectURL(image.src)
        document.getElementById('pictures')!.append(image)
      }finally{result.release()}
    }
    const defaults=await acquireRasterImage(scene,new Map(),{format:'png',timeMs:500,background:'transparent'},{resources})
    try{check('same source defaults remain distinct from caller parameter snapshot',(await pixel(defaults.value.blob,13,6))[3]===0)}finally{defaults.release()}
    const jpeg=await acquireRasterImage(scene,new Map(),{format:'jpeg',timeMs:500,background:'transparent',paramValues:params},{resources})
    try{
      check('JPEG reports alpha fallback and actually composites onto opaque white',jpeg.value.warnings.length===1&&(await pixel(jpeg.value.blob,24,6))[3]===255)
    }finally{jpeg.release()}
    check('source recipes, defaults and caller parameter map remain unchanged',JSON.stringify(scene)===source&&params.get('amount')===12)
  }finally{resources.dispose();renderSurfacePool.clearIdle()}
  check('native jobs and managed output return to baseline',resources.getSnapshot().jobs.active===0&&resources.getSnapshot().residency.chargedBytes===0&&editorResourceBudget.getSnapshot().chargedBytes===baseline)
  return {passed:true,checks,environment:{userAgent:navigator.userAgent,dpr:devicePixelRatio},policy:editorResourceBudget.getSnapshot(),scope:'Native Canvas2D RGBA8/default sRGB, actual codecs; legacy bitmap upscale retained. No FP16, color-profile conversion or full Export E0 parity claim.'}
}

document.getElementById('app')!.innerHTML='<style>body{background:#0b1220;color:#e2e8f0;font:14px system-ui;margin:24px}pre{white-space:pre-wrap}button{padding:12px}img{image-rendering:pixelated;width:256px;border:1px solid #94a3b8;margin:12px}</style><h1>Pre-3D frame contract</h1><button id="run">Run frame contract checks</button><p id="status">Ready</p><div id="pictures"></div><pre id="report"></pre>'
document.getElementById('run')!.onclick=async()=>{
  const button=document.getElementById('run') as HTMLButtonElement;button.disabled=true
  try{const result=await run();document.getElementById('report')!.textContent=JSON.stringify(result,null,2);document.getElementById('status')!.textContent='PASS'}
  catch(error){document.getElementById('report')!.textContent=JSON.stringify({passed:false,error:String(error)});document.getElementById('status')!.textContent='FAIL'}
}

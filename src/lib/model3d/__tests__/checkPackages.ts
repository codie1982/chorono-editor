import type { MCPHost } from '../../mcp/editor'
import { executeEditorJob } from '../../mcp/editor'
import { acquireRasterImage } from '../../export/raster/RasterExportEngine'
import { acquirePortableScene } from '../../export/portable/PortableSceneOutput'
import { OutputResources, editorOutputResources } from '../../export/resources'
import { editorResourceBudget } from '../../resources/budget'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { viewportPixels, pngPixels, pixelDifference, showFrame } from './clipPixelChecks'
import { modelAssetService } from '../resources/ModelAssetService'
import { renderSurfacePool } from '../../render/resources/CanvasSurfacePool'
/** Same-browser real GLTFLoader/skinning/morph/WebGL/depth/PNG acceptance.
 * Each output owns its pins. The test never mutates the editor source/history. */
export async function checkPackages(host: MCPHost, canvases: readonly HTMLCanvasElement[]) {
  const scene=host.editor.getCommittedScene(), before=JSON.stringify(scene), checks:string[]=[], samples:unknown[]=[], repeated=new Map<number,Uint8ClampedArray>(), output=new OutputResources({budget:editorResourceBudget})
  const check=(name:string,ok:boolean)=>{if(!ok)throw new Error(name);checks.push(name)}
  let peak=0
  try {
    for(const timeMs of [0,250,500,799,800,1250,2000,500,0]) {
      const frame=evaluateSceneFrame(scene,timeMs), view=await viewportPixels(scene,timeMs,frame.overrides)
      const reply=await executeEditorJob({id:`package:${timeMs}`,method:'render_preview',args:{timeMs,timelineIds:['outer'],width:500}},host)
      const preview=await pngPixels(new Blob([Uint8Array.from(atob(reply.data),c=>c.charCodeAt(0))],{type:'image/png'}))
      const lease=await acquireRasterImage(scene,new Map(),{format:'png',timeMs},{resources:output})
      let raster:Uint8ClampedArray
      try {raster=await pngPixels(lease.value.blob);check(`warning-free raster ${timeMs}`,lease.value.warnings.length===0)}finally{lease.release()}
      const a=pixelDifference(view,preview),b=pixelDifference(view,raster)
      check(`viewport/MCP/raster equality ${timeMs}`,a.changed===0&&b.changed===0);samples.push({timeMs,preview:a,raster:b})
      if(repeated.has(timeMs))check(`backwards seek exact ${timeMs}`,pixelDifference(view,repeated.get(timeMs)!).changed===0)
      else repeated.set(timeMs,view)
      if(timeMs===500)[view,preview,raster].forEach((p,i)=>showFrame(canvases[i],p,500,320))
      peak=Math.max(peak,editorResourceBudget.getSnapshot().chargedBytes)
    }
    check('native skeleton/morph plus outer keys visibly animate',pixelDifference(repeated.get(0)!,repeated.get(500)!).changed>500)
    const portable=await acquirePortableScene(scene)
    try {const reopened=parseSceneJson(JSON.stringify(portable.value),true);check('portable assembly retains both assets',reopened.assets.length===2&&reopened.assets.every(a=>a.url.startsWith('data:')))
      check('portable reopen reproduces exact pixels',pixelDifference(await viewportPixels(reopened,500,evaluateSceneFrame(reopened,500).overrides),repeated.get(500)!).changed===0)
    }finally{portable.release()}
    check('source/revision/history unchanged by output',JSON.stringify(host.editor.getCommittedScene())===before&&host.editor.getRevision()===0&&host.editor.getCommittedHistory().past.length===0)
  }finally{output.dispose();editorOutputResources.clearIdle();renderSurfacePool.clearIdle();modelAssetService.clearIdle()}
  return {passed:true,checks,samples,peakChargedBytes:editorResourceBudget.getSnapshot().peakBytes,budget:editorResourceBudget.getSnapshot(),scope:'same browser/GPU, native skin+morph and two-model scene; managed estimates are not total RAM'}
}

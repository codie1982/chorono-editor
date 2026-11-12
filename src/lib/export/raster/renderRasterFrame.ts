import type {ChronoScene} from '../../types'
import type {VisualMediaSession} from '../../render/media/VisualMediaSession'
import {withMediaFrame} from '../../render/media/withMediaFrame'
import {canvasRenderer} from '../../render/CanvasRenderer'
import {requireFrameBytes} from '../../asset/metadata/frameBytes'
import {acquireOutputCanvas} from '../resources/OutputCanvasAdapter'
import {encodeOutputCanvas} from '../resources/encodeOutputCanvas'
import type {OutputScope} from '../resources/OutputScope'
import {RASTER_MIME,RASTER_SUPPORTS_ALPHA,RASTER_EXTENSION} from './ImageEncoders'
import type {RasterExportOptions,RasterExportResult} from './RasterExportEngine'
import {assertRasterLayerSupport} from './assertRasterLayerSupport'

/** Internal frame step shared by single-image and sequence jobs. It never
 * submits another outer job. Caller owns scope through use of the returned Blob;
 * native surfaces and encoder workspace are released after actual encoding.
 * Existing composition-resolution render + bitmap upscale is intentionally
 * preserved; high-resolution vector/final-quality changes belong to Export E0.
 * Viewport LOD/visible-area options are deliberately never forwarded. Every
 * image and sequence frame draws original layers over the full composition;
 * a previously warmed global viewport proxy cannot change output detail.
 */
export async function renderRasterFrame(scene:ChronoScene,opts:RasterExportOptions,scope:OutputScope,
  signal?:AbortSignal,media?:VisualMediaSession):Promise<RasterExportResult>{
  scope.check(signal)
  assertRasterLayerSupport(scene)
  const baseW=scene.composition.width,baseH=scene.composition.height
  const requested=opts.scale??1,timeMs=opts.timeMs??0,quality=opts.quality??0.92
  if(!Number.isFinite(requested)||!Number.isFinite(timeMs)||!Number.isFinite(quality)||quality<0||quality>1)throw new RangeError('Invalid raster time/scale/quality.')
  if(!Object.hasOwn(RASTER_MIME,opts.format))throw new TypeError('Unsupported raster format.')
  const scale=Math.max(1,requested),outW=Math.round(baseW*scale),outH=Math.round(baseH*scale)
  requireFrameBytes(baseW,baseH);requireFrameBytes(outW,outH)
  const warnings:string[]=[]
  let background=opts.background??'scene'
  if(background==='transparent'&&!RASTER_SUPPORTS_ALPHA[opts.format]){
    background={color:'#ffffff'};warnings.push(`${opts.format.toUpperCase()} has no alpha channel — transparent background exported as white.`)
  }
  const base=acquireOutputCanvas(scope,baseW,baseH)
  let target:ReturnType<typeof acquireOutputCanvas>|undefined
  try{
    return await withMediaFrame(scene,timeMs,base.context,{signal,paramValues:opts.paramValues},async(assets,overrides)=>{
      scope.check(signal)
      canvasRenderer.render(base.context,scene,timeMs,null,assets,{overrides,renderMode:'preview',background,paramValues:opts.paramValues})
      scope.check(signal)
      let canvas=base.canvas
      if(scale!==1){
        target=acquireOutputCanvas(scope,outW,outH);target.context.imageSmoothingEnabled=true;target.context.imageSmoothingQuality='high'
        target.context.drawImage(base.canvas,0,0,outW,outH);canvas=target.canvas
      }
      const encoded=await encodeOutputCanvas(scope,canvas,opts.format,quality,signal)
      scope.check(signal)
      return {blob:encoded.value,width:outW,height:outH,filename:`${scene.composition.id||'scene'}.${RASTER_EXTENSION[opts.format]}`,warnings}
    },media)
  }finally{target?.release();base.release()}
}

import {requireFrameBytes} from '../../asset/metadata/frameBytes'
import {encodeCanvas,type RasterFormat} from '../raster/ImageEncoders'
import type {OutputScope} from './OutputScope'
import type {OutputHandle} from './types'

/** Estimate one output frame plus row/chunk overhead before native encoding.
 * This is an explicit policy, not a hard bound on PNG/WebP/JPEG encoder internals.
 * Actual returned Blob is separately limited/reconciled before publication. */
export async function encodeOutputCanvas(scope:OutputScope,canvas:HTMLCanvasElement,
  format:RasterFormat,quality:number,signal?:AbortSignal,maxBytes=128*1024**2):Promise<OutputHandle<Blob>>{
  scope.check(signal)
  const frameBytes=requireFrameBytes(canvas.width,canvas.height)
  const estimate=Math.min(maxBytes,frameBytes+canvas.height+65536)
  const scratch=scope.own(frameBytes,()=>null)
  try{
    return await scope.prepare(estimate,()=>encodeCanvas(canvas,format,quality),blob=>{
      if(blob.size>maxBytes)throw new RangeError('Encoded image exceeds the output byte limit.')
      return blob.size
    },()=>{},'derived',signal)
  }finally{scratch.release()}
}

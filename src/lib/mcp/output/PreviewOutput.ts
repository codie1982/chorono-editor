import type {ChronoScene} from '../../types'
import type {OverrideMap} from '../../evaluator'
import type {ParamValueMap} from '../../runtime/paramResolver'
import {canvasRenderer} from '../../render/CanvasRenderer'
import {withMediaFrame} from '../../render/media/withMediaFrame'
import {acquireOutputCanvas,encodeOutputCanvas,outputBlobBase64,type OutputScope} from '../../export/resources'
import {LIMITS} from '../protocol'

/** Same preview frame/background/downscale path with bounded owned surfaces.
 * Dimension rejection precedes DOM/native backing creation. toBlob is awaited
 * through real completion; cancellation cannot free its input canvas early.
 * The output scope retains only the base64 result after encoding/conversion.
 * Sampling and rendering capabilities remain the existing preview contract. */
export async function previewOutput(scene:ChronoScene,timeMs:number,width:number,frame:{overrides:OverrideMap;paramValues:ParamValueMap},scope:OutputScope,signal?:AbortSignal){
  const height=Math.max(1,Math.round(width*scene.composition.height/scene.composition.width))
  if(!Number.isSafeInteger(width)||width<1||width*height>LIMITS.previewPixels)throw new RangeError('Preview pixel limit exceeded; use a smaller width')
  if(scene.composition.width*scene.composition.height>16_777_216)throw new RangeError('Composition is too large for preview')
  const temporary=scope.child()
  try{
    const base=acquireOutputCanvas(temporary,scene.composition.width,scene.composition.height)
    const output=acquireOutputCanvas(temporary,width,height)
    const blob=await withMediaFrame(scene,timeMs,base.context,{overrides:frame.overrides,signal},async assets=>{
      scope.check(signal)
      canvasRenderer.render(base.context,scene,timeMs,null,assets,{renderMode:'preview',overrides:frame.overrides,paramValues:frame.paramValues})
      output.context.drawImage(base.canvas,0,0,width,height)
      return encodeOutputCanvas(temporary,output.canvas,'png',1,signal,24*1024**2)
    })
    const data=await outputBlobBase64(scope,blob.value,24*1024**2,signal)
    return {mimeType:'image/png',data:data.value,width,height,timeMs}
  }finally{temporary.dispose()}
}

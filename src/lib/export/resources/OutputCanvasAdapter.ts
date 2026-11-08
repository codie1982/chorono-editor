import {canvasMemoryTracker} from '../../resources/memory/CanvasMemoryTracker'
import {requireFrameBytes} from '../../asset/metadata/frameBytes'
import type {CanvasSurfaceLease} from '../../render/resources/CanvasSurfacePool'
import type {OutputScope} from './OutputScope'

/** Owned output backing at validated pixel dimensions. Shares the existing
 * RGBA calculation/tracker but is not a versioned cache or idle render pool.
 * Admission precedes DOM creation/resizing; release shrinks pixels before charge
 * removal. Failed native reset remains quarantined in the shared output owner.
 * Caller may borrow canvas/context only until release or enclosing scope exit. */
export function acquireOutputCanvas(scope:OutputScope,width:number,height:number,
  create:()=>HTMLCanvasElement=()=>document.createElement('canvas')):CanvasSurfaceLease{
  const bytes=requireFrameBytes(width,height)
  const handle=scope.own(bytes,create,canvas=>{canvas.width=0;canvas.height=0})
  try{
    const canvas=handle.value;canvas.width=width;canvas.height=height;canvasMemoryTracker.track(canvas)
    const context=canvas.getContext('2d')
    if(!context)throw new Error('Output canvas failed to acquire a 2D context.')
    return {canvas,context,release:()=>handle.release()}
  }catch(error){handle.release();throw error}
}

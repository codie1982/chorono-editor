import {materializeRenderScene as reference} from 'projection-reference'
import {materializeRenderScene as current} from '../../../render/materializeOverrides'

let selected:typeof current=current,index:0|1=1,counts:[number,number]=[0,0]
/** Test build only. Production prepareRenderFrame imports its normal projector;
 * the same-realm compiler supplies this source module as that single import.
 * AA maps both sides to the SAME current function, not another compiled copy. */
export function selectProjection(side:number,control:boolean):void{
 if(side!==0&&side!==1)throw new RangeError('Invalid projection side.')
 index=control?1:side;selected=index?current:reference
}
/** Reset call evidence after warmup; never clears production caches/resources. */
export function resetProjectionCounts():void{counts=[0,0]}
/** Detached counters prove which algorithm actually ran during timed draws. */
export function projectionCounts(){return {reference:counts[0],current:counts[1]}}
/** Delegate through the original public signature; no source or result mutation. */
export function materializeRenderScene(...args:Parameters<typeof current>):ReturnType<typeof current>{counts[index]++;return selected(...args)}

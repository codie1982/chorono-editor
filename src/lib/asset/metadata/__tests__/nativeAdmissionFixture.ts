import {ResourceBudget} from '../../../resources/budget'
import {BoundedJobQueue} from '../../../resources/jobs'
import {assetSourcePool} from '../../sources'
import {until} from '../../../resources/testing/nativeSettlement'
export {until,deliveryGate} from '../../../resources/testing/nativeSettlement'

export interface AdmissionResult {name:string;passed:boolean;details?:unknown}
/** Fixed private admission context; visible copied QA canvases are separate
 * evidence surfaces, never claimed as zero physical browser RAM after cleanup. */
export function admissionFixture(copies:HTMLElement) {
  const budget=new ResourceBudget({maxBytes:512*1024**2}),executor=new BoundedJobQueue({concurrency:2,maxQueued:128})
  const rows:AdmissionResult[]=[],sources:ReturnType<typeof assetSourcePool.create>[]=[],pins:{release():void}[]=[]
  return {budget,executor,rows,
    test(name:string,passed:boolean,details?:unknown){rows.push({name,passed,details});if(!passed)throw new Error(name)},
    source(blob:Blob){const source=assetSourcePool.create(blob);sources.push(source);return source},
    pin<T extends {release():void}>(pin:T):T{pins.push(pin);return pin},
    surface(label:string,width=320,height=64){const figure=document.createElement('figure'),caption=document.createElement('figcaption'),canvas=document.createElement('canvas')
      canvas.width=width;canvas.height=height;caption.textContent=label;figure.append(canvas,caption);copies.append(figure);return canvas},
    async cleanup(){pins.forEach(pin=>pin.release());sources.forEach(source=>source.release());executor.dispose();await until(()=>executor.getSnapshot().active===0&&executor.getSnapshot().queued===0);await Promise.resolve()},
  }
}
export type AdmissionFixture=ReturnType<typeof admissionFixture>


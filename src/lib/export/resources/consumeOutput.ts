import type {ResourceLease} from '../../resources/residency'
import {editorOutputResources} from './editorOutputResources'
import type {OutputResources} from './OutputResources'

/** Consume an already prepared result through the same bounded output queue.
 * Clipboard/file-like async consumers must not escape native concurrency merely
 * because their producer has finished. A retained pin covers queue wait and
 * actual consumer settlement; abort never releases borrowed text/Blob early.
 * Caller retains its independent original pin. The consumer returns no backing
 * value and must guard late UI publication with its supplied signal.
 *
 * Invoke AFTER producer acquisition, never recursively from an active output
 * job. Composed jobs instead await consumption directly in their current scope.
 * Hosts may inject their existing owner; editor UI defaults to the shared owner.
 */
export async function consumeOutput<T>(lease:ResourceLease<T>,consume:(value:T,signal:AbortSignal)=>void|Promise<void>,
  options:{signal?:AbortSignal;resources?:OutputResources}={}):Promise<void>{
  const pin=lease.retain();let result:ResourceLease<void>|undefined
  try{
    result=await(options.resources??editorOutputResources).run(async(scope,signal)=>{
      scope.adopt(pin);await consume(pin.value,signal);scope.check(signal)
    },options)
  }finally{result?.release();pin.release()}
}

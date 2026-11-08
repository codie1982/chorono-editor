import type {ResourceCategory,ResourceAllocator} from '../../resources/budget'
import type {ResourceLease} from '../../resources/residency'

/** Scoped borrow: no retain/escape capability. The scope releases it on exit;
 * release is idempotent and access after release is invalid. */
export interface OutputHandle<T>{readonly value:T;release():void}
/** Allocation port keeps orchestration independent of native canvas/audio/Blob.
 * Factories own partial setup if they throw before returning a value. */
export interface OutputAllocator extends ResourceAllocator {
  own<T>(bytes:number,create:()=>T,dispose:(value:T)=>void,category?:ResourceCategory):ResourceLease<T>
  prepare<T>(bytes:number,work:()=>Promise<T>,measure:(value:T)=>number,dispose:(value:T)=>void,category?:ResourceCategory,signal?:AbortSignal):Promise<ResourceLease<T>>
}
export interface OutputResourceOptions {
  budget?:ResourceAllocator
  maxBytes?:number
  maxEntries?:number
  concurrency?:number
  maxQueued?:number
  timeoutMs?:number
}

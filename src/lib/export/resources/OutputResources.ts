import {ResidentResourceCache,type ResourceLease} from '../../resources/residency'
import {BoundedJobQueue,cancelledJobError,withPreparationDeadline} from '../../resources/jobs'
import type {ResourceCategory} from '../../resources/budget'
import {OutputScope} from './OutputScope'
import type {OutputAllocator,OutputResourceOptions} from './types'

interface Disposable{dispose():void}

/** Bounded output jobs plus explicit temporary/result ownership. Reuses the
 * existing FIFO, ledger, pins and failed-cleanup quarantine; no new LRU or media
 * scheduler. Default 448 MiB/4096 records overlaps the host's 512 MiB ledger.
 * Two jobs/eight waiting and a ten-minute inclusive deadline bound metadata and
 * native output work. This is not a codec/driver/process RAM hard cap.
 *
 * Result leases own their complete scope until final release; caller must stop
 * retaining borrowed Blob/buffer/JSON values afterwards. Inner raster/ZIP/audio
 * steps use child scopes, never recursively submit into this same job queue.
 * All state is private and instance-local; platform creation is injected work. */
export class OutputResources implements OutputAllocator {
  private readonly owner:ResidentResourceCache<Disposable>
  private readonly jobs:BoundedJobQueue
  private readonly timeoutMs:number
  private disposed=false
  constructor(options:OutputResourceOptions={}){
    this.timeoutMs=options.timeoutMs??600000
    if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<=0||this.timeoutMs>2147483647)throw new RangeError('Invalid output preparation deadline.')
    this.owner=new ResidentResourceCache({category:'derived',label:'output resources',maxBytes:options.maxBytes??448*1024**2,
      maxEntries:options.maxEntries??4096,maxIdleMs:0,budget:options.budget,dispose:value=>value.dispose()})
    this.jobs=new BoundedJobQueue({concurrency:options.concurrency??2,maxQueued:options.maxQueued??8})
  }

  /** Borrow this exact local+host ledger for bounded input/copy adapters. A
   * cooperating reader owns its returned ticket, including actual cancellation
   * settlement. Null means capacity refusal, never permission to allocate. */
  reserve(category:ResourceCategory,bytes:number){this.check();return this.owner.tryReserve(bytes,category)}

  /** Run one outer output operation. The ready result owns every remaining
   * scope handle until its final independent consumer pin is released. Abort
   * discards a late result before freeing the slot; native work is always awaited. */
  run<T>(work:(scope:OutputScope,signal:AbortSignal)=>Promise<T>,options:{signal?:AbortSignal}={}):Promise<ResourceLease<T>>{
    return withPreparationDeadline('Output job',this.timeoutMs,options.signal,signal=>this.jobs.submit(async native=>{
      const scope=new OutputScope(this)
      return this.prepare(1,async()=>{try{return await work(scope,native)}catch(error){scope.dispose();throw error}},()=>1,()=>scope.dispose(),'derived',native)
    },{signal,discard:lease=>lease.release()}))
  }

  /** Synchronous owned allocation. Reserve precedes factory construction and
   * cleanup precedes uncharging. Partial factories must clean before throwing. */
  own<T>(bytes:number,create:()=>T,dispose:(value:T)=>void,category:ResourceCategory='derived'):ResourceLease<T>{
    this.check()
    const ticket=this.owner.reserve(bytes,category)
    let box:{value:T}|null=null,transferred=false
    const record={dispose(){if(box){dispose(box.value);box=null}}}
    try{box={value:create()};const lease=this.owner.admit(null,record,bytes,ticket);transferred=true;return this.map(lease,()=>box!.value)}
    finally{if(!transferred)this.owner.discard(record,ticket)}
  }

  /** Reserve before async/native work, then reconcile actual output. The record
   * retains a failed value and reservation if cleanup fails; clearIdle retries.
   * Native promises are never replaced with timeout/abort races. */
  async prepare<T>(bytes:number,work:()=>Promise<T>,measure:(value:T)=>number,dispose:(value:T)=>void,category:ResourceCategory='derived',signal?:AbortSignal):Promise<ResourceLease<T>>{
    this.check()
    if(signal?.aborted)throw cancelledJobError()
    const ticket=this.owner.reserve(bytes,category)
    let box:{value:T}|null=null,transferred=false
    const record={dispose(){if(box){dispose(box.value);box=null}}}
    try{
      box={value:await work()}
      if(signal?.aborted)throw cancelledJobError()
      const size=measure(box.value)
      if(!Number.isSafeInteger(size)||size<0)throw new RangeError('Invalid output byte measurement.')
      const lease=this.owner.admit(null,record,Math.max(1,size),ticket);transferred=true
      return this.map(lease,()=>box!.value)
    }finally{if(!transferred)this.owner.discard(record,ticket)}
  }

  /** Retry failed cleanup; active/pinned output values remain valid. */
  clearIdle():void{this.owner.clearIdle()}
  /** Cancel this owner's jobs; non-abortable work remains active until settled. */
  cancelPending():void{this.jobs.cancelAll()}
  /** Close new jobs without invalidating existing result pins. */
  dispose():void{this.disposed=true;this.jobs.dispose();this.owner.clearIdle()}
  /** Numeric overlapping policy only, never DOM/Blob/source/scene payloads. */
  getSnapshot(){return {jobs:this.jobs.getSnapshot(),residency:this.owner.getSnapshot()}}

  /** Adapt a disposable pin without casts or a second retain/release algorithm. */
  private map<T>(lease:ResourceLease<Disposable>,value:()=>T):ResourceLease<T>{
    return {get value(){lease.value;return value()},retain:()=>this.map(lease.retain(),value),release:()=>lease.release()}
  }
  /** Existing pins remain usable, but a disposed owner cannot recreate work. */
  private check():void{if(this.disposed)throw new Error('Output resources are disposed.')}
}

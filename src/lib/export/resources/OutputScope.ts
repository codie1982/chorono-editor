import type {ResourceCategory} from '../../resources/budget'
import {cancelledJobError} from '../../resources/jobs'
import type {OutputAllocator,OutputHandle} from './types'

/** One output operation's resource lifetime. Child scopes share admission but
 * release their own temporary values (e.g. one sequence frame) independently.
 * Completed values cannot escape except through the enclosing result lease.
 * Disposal during non-abortable prepare defers all releases until that native
 * operation actually settles. No DOM, scene, codec or eviction algorithm here.
 * Instances own only their handles/children; allocator lifetime is borrowed. */
export class OutputScope {
  private readonly owned=new Set<OutputHandle<unknown>>()
  private readonly children=new Set<OutputScope>()
  private closing=false
  private pending=0
  constructor(private readonly allocator:OutputAllocator,private readonly detached?:()=>void){}
  /** Read/copy ports borrow the same ledger, never a second independent limit.
   * They retain/release their own tickets through actual native settlement. */
  get budget(){this.check();return this.allocator}
  /** Transfer an already owned pin into this scope. Caller stops releasing the
   * transferred pin; any independently retained sibling pin is unaffected. */
  adopt<T>(lease:OutputHandle<T>):OutputHandle<T>{this.check();return this.keep(lease)}

  /** Reserve before factory invocation, then keep its result until release or
   * scope disposal. Units are owner-supplied byte estimates; category is runtime
   * accounting only. Factory partial failures must clean their partial values. */
  own<T>(bytes:number,create:()=>T,dispose:(value:T)=>void=()=>{},category:ResourceCategory='derived'):OutputHandle<T>{
    this.check();return this.keep(this.allocator.own(bytes,create,dispose,category))
  }

  /** Admit a native working-set estimate before work; reconcile actual output
   * before publication. Never race actual promise settlement on cancellation.
   * Disposer must be idempotent for failed-cleanup quarantine/retry. */
  async prepare<T>(bytes:number,work:()=>Promise<T>,measure:(value:T)=>number,dispose:(value:T)=>void=()=>{},category:ResourceCategory='derived',signal?:AbortSignal):Promise<OutputHandle<T>>{
    this.check(signal);this.pending++
    try{
      const lease=await this.allocator.prepare(bytes,work,measure,dispose,category,signal)
      const handle=this.keep(lease)
      this.check(signal);return handle
    }finally{this.pending--;this.flush()}
  }

  /** Fresh temporary ownership without another job-queue admission. Closing a
   * child removes it from the parent, bounding long sequence bookkeeping. */
  child():OutputScope{
    this.check();const child=new OutputScope(this.allocator,()=>{this.children.delete(child);this.flush()});this.children.add(child);return child
  }

  /** Request idempotent cleanup. Pending native work keeps every required
   * backing value protected until its actual settlement. New work is refused. */
  dispose():void{this.closing=true;this.children.forEach(child=>child.dispose());this.flush()}

  /** Shared signal check used at frame/conversion/publication boundaries. */
  check(signal?:AbortSignal):void{
    if(signal?.aborted)throw cancelledJobError()
    if(this.closing)throw new Error('Output scope is disposed.')
  }

  /** Scope-bound handles deliberately omit retain, so their lifetime cannot
   * contradict a ResourceLease's independent ownership contract. */
  private keep<T>(lease:OutputHandle<T>):OutputHandle<T>{
    let released=false
    const handle:OutputHandle<T>={get value(){if(released)throw new Error('Output handle has been released.');return lease.value},release:()=>{
      if(released)return;released=true;this.owned.delete(handle);lease.release()
    }}
    this.owned.add(handle);return handle
  }
  /** Underlying residency releases quarantine failures and keep their charges.
   * Child pending work owns its reservations even if this parent has no work. */
  private flush():void{
    if(!this.closing||this.pending||this.children.size)return
    this.owned.forEach(handle=>handle.release());this.owned.clear();this.detached?.()
  }
}

import type {ChronoScene} from '../../types'
import {SceneSaveConflictError} from './SceneSaveConflictError'

export type SceneSaveState='idle'|'saving'|'saved'|'error'|'offline'
export interface SceneSaveStatus{state:SceneSaveState;version:number;retryCount:number;error?:Error}
interface Pending{scene:ChronoScene;release():void;firstAt:number;notBefore:number;attempt:number}
interface Options{
  intervalMs?:number;fallbackMs?:number
  retain(scene:ChronoScene):{release():void}
  save(scene:ChronoScene,version:number,signal:AbortSignal):Promise<number>
  onStatus(status:SceneSaveStatus):void
  online?:()=>boolean
}

/** Per-server-scene autosave orchestration with one active and one latest pending
 * source snapshot. New pending input replaces/releases the previous input; edits
 * do not abort a CAS write already in flight. A finite three-retry exponential
 * backoff shares the same single pending slot/timer, so obsolete scene closures
 * cannot accumulate. Conflicts and quota failures are terminal for that request.
 *
 * IO/serialization/source ownership is injected. Instances own pending pins,
 * controllers and two finite timers; no DOM/storage/framework dependency. The
 * last successful scene is weak identity only. dispose cancels pending and
 * requests active abort, but actual active cleanup belongs to the save port.
 */
export class SceneAutoSaveCoordinator{
  private readonly interval:number
  private readonly fallback:number
  private pending:Pending|null=null
  private active:{work:Pending;controller:AbortController}|null=null
  private timer?:ReturnType<typeof setTimeout>
  private idleTimer?:ReturnType<typeof setTimeout>
  private last?:WeakRef<ChronoScene>
  private version=0
  private closed=false
  constructor(private readonly options:Options){
    this.interval=options.intervalMs??500;this.fallback=options.fallbackMs??10000
    if([this.interval,this.fallback].some(value=>!Number.isSafeInteger(value)||value<1||value>3600000))throw new RangeError('Invalid autosave intervals.')
  }
  /** Retain at most one latest input. immediate skips debounce for manual save.
   * Same active/pending/successful identities do not submit duplicate writes. */
  request(scene:ChronoScene,immediate=false):void{
    if(this.closed)return
    if(this.active?.work.scene===scene){this.pending?.release();this.pending=null;clearTimeout(this.timer);return}
    if(this.pending?.scene===scene){if(immediate)this.pending.notBefore=Date.now();this.schedule();return}
    if(!this.active&&!this.pending&&this.last?.deref()===scene&&!immediate)return
    const firstAt=this.pending?.firstAt??Date.now(),pin=this.options.retain(scene)
    this.pending?.release()
    this.pending={scene,release:()=>pin.release(),firstAt,notBefore:immediate?Date.now():Math.min(Date.now()+this.interval,firstAt+this.fallback),attempt:0}
    clearTimeout(this.idleTimer);this.schedule()
  }
  /** Release pending sources/timers and invalidate all late UI publication. */
  dispose():void{
    this.closed=true;clearTimeout(this.timer);clearTimeout(this.idleTimer)
    this.pending?.release();this.pending=null;this.active?.controller.abort();this.last=undefined
  }
  /** A single next wakeup; active writes serialize CAS version advancement. */
  private schedule():void{
    clearTimeout(this.timer)
    if(this.closed||this.active||!this.pending)return
    this.timer=setTimeout(()=>{this.timer=undefined;void this.pump()},Math.max(0,this.pending.notBefore-Date.now()))
  }
  /** Native IO is awaited. A replaced input is never revived by old retry work. */
  private async pump():Promise<void>{
    if(this.closed||this.active||!this.pending)return
    clearTimeout(this.idleTimer);this.idleTimer=undefined
    const work=this.pending;this.pending=null
    const controller=new AbortController();this.active={work,controller};this.emit('saving',work.attempt)
    let transferred=false
    try{
      if(this.options.online?.()===false){this.emit('offline',0);return}
      const version=await this.options.save(work.scene,this.version,controller.signal)
      if(this.closed||controller.signal.aborted)return
      if(!Number.isSafeInteger(version)||version<this.version)throw new RangeError('Invalid saved scene version.')
      this.version=version;this.last=new WeakRef(work.scene);this.emit('saved',0)
      if(!this.pending)this.idleTimer=setTimeout(()=>{this.idleTimer=undefined;if(!this.active&&!this.pending)this.emit('idle',0)},2000)
    }catch(failure){
      if(this.closed||controller.signal.aborted)return
      const error=failure instanceof Error?failure:new Error(String(failure))
      const retryable=!(error instanceof SceneSaveConflictError)&&!(error instanceof RangeError)&&work.attempt<3
      const attempt=work.attempt+1
      this.emit('error',attempt,error)
      if(retryable&&!this.pending){
        work.notBefore=Date.now()+Math.min(2000*2**work.attempt,16000);work.attempt=attempt;this.pending=work;transferred=true
      }
    }finally{
      this.active=null;if(!transferred)work.release();this.schedule()
    }
  }
  /** Detached status only. Observer exceptions never break IO/source cleanup. */
  private emit(state:SceneSaveState,retryCount:number,error?:Error):void{
    if(!this.closed)try{this.options.onStatus({state,retryCount,version:this.version,error})}catch{/* Observers cannot interrupt an IO lifetime. */}
  }
}

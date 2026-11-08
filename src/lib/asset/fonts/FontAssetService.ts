import type {Asset} from '../../types'
import {editorResourceBudget,type ResourceAllocator} from '../../resources/budget'
import {ResidentResourceCache} from '../../resources/residency'
import {SharedPreparationQueue,cancelledJobError,withPreparationDeadline,editorMediaPreparation,type JobExecutor} from '../../resources/jobs'
import {assetSourcePool} from '../sources'
import {configureTextFontFamilyResolver} from '../../text/resolveTextFontFamily'
import {describeFont,fontCatalog} from './FontCatalog'
import {browserFontDecoder} from './browserFontDecoder'
import type {FontDecoder,FontLease,FontResource} from './types'
import {FontBinaryReader,fontPolicyBytes,type FontBinarySource,type FontBinaryInput} from './input'

export interface FontAssetOptions {
  budget?:ResourceAllocator;maxBytes?:number;maxEntries?:number;maxIdleMs?:number
  maxConcurrent?:number;maxQueued?:number;timeoutMs?:number;decoder?:FontDecoder
  /** Borrow aggregate execution capacity without sharing service cancellation. */
  executor?:JobExecutor
  /** Bounded encoded-data port. Default browser backend always uses it. An
   * injected decoder-only platform adapter retains its input responsibility. */
  inputSource?:FontBinarySource
}
let nextAlias=0

/**
 * Owns shared native font registration by URL + authored family. Reuses the
 * existing preparation scheduler and resident cache: dedupe, independent cancel,
 * delivery pins, retire, 2s idle grace and failed-cleanup quarantine. No native
 * font is constructed until acquired. Aliases are unique across service instances
 * within this realm, preventing same-name sources from changing another job.
 *
 * FontFace exposes no decoded/glyph-cache byte count. Admission charges are an
 * explicit policy estimate (min 1 MiB / 8x actual encoded input / table reference;
 * decoder-only custom adapters use declared metadata, unknown 4 MiB), NOT
 * measured font RAM. Local default 32 MiB/64 records overlaps the editor ledger.
 * These policy bytes are reported separately, never added to known pixel/PCM RAM.
 */
export class FontAssetService {
  private readonly cache:ResidentResourceCache<FontResource>
  private readonly queue:SharedPreparationQueue<FontLease>
  private readonly decode:FontDecoder
  private readonly timeoutMs:number
  private readonly inputSource:FontBinarySource|null
  private generation=0
  private disposed=false
  /** Configure finite policy limits and a per-consumer 15s deadline (including
   * queue time). Construction starts no timers/native work. Inject a decoder
   * for a platform/test adapter, a budget to overlap a host-wide ledger, and an
   * optional borrowed executor for aggregate capacity. It is never disposed here. */
  constructor(options:FontAssetOptions={}) {
    this.timeoutMs=options.timeoutMs??15000
    if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<=0||this.timeoutMs>2147483647)throw new RangeError('Invalid font preparation deadline.')
    this.cache=new ResidentResourceCache({...options,category:'font',label:'font registration',maxBytes:options.maxBytes??32*1024**2,
      maxEntries:options.maxEntries??64,dispose:resource=>resource.dispose()})
    this.queue=new SharedPreparationQueue({concurrency:options.maxConcurrent??2,maxQueued:options.maxQueued??128,label:'Font asset service',
      executor:options.executor,
      release:lease=>lease.release(),discard:(key,lease)=>{this.cache.invalidate(key,lease.value);lease.release()}})
    this.decode=options.decoder??browserFontDecoder
    this.inputSource=options.inputSource??(options.decoder?null:new FontBinaryReader({budget:options.budget}))
  }
  /** Own a ready face until release; a shared request retains each caller's own
   * pin. Abort rejects this consumer promptly without freeing a still-running
   * native load's slot/charge/source. A finite deadline includes queue wait and
   * rejects this consumer with TimeoutError; other callers remain independent.
   * No project descriptor is mutated. Missing/invalid metadata rejects explicitly. */
  async acquire(asset:Asset,options:{signal?:AbortSignal}={}):Promise<FontLease> {
    this.check(options.signal)
    const descriptor=describeFont(asset),cached=this.cache.acquire(descriptor.key)
    if(cached)return cached
    const size=asset.metadata?.filesize
    const estimate=typeof size==='number'&&Number.isSafeInteger(size)&&size>0?Math.max(1024**2,size*8):4*1024**2
    if(!Number.isSafeInteger(estimate))throw new RangeError('Invalid font admission estimate.')
    const generation=this.generation
    return withPreparationDeadline('Font preparation',this.timeoutMs,options.signal,signal=>
      this.queue.request(descriptor.key,producerSignal=>this.prepare(asset.url,descriptor.key,estimate,generation,producerSignal),lease=>lease.retain(),signal,
        ()=>{const source=assetSourcePool.retainUrls([asset.url]);return ()=>source.release()}))
  }
  /** Borrow only for synchronous measurement while another consumer owns use;
   * no acquire, idle refresh or native construction occurs here. */
  peekAlias(asset:Asset):string|undefined {return this.cache.peek(describeFont(asset).key)?.alias}
  /** Retire old lookups; promised callers/pins retain their exact old face. */
  clear():void {this.generation++;this.queue.forget();this.cache.clear()}
  /** Explicit unused cleanup retries quarantined native deletion too. */
  clearIdle():void {this.cache.clearIdle()}
  /** Cancel pending consumers; non-abortable loads remain charged until settled. */
  cancelPending():void {this.queue.cancelAll();this.clear()}
  /** Stop admission without destroying another caller's outstanding pin. */
  dispose():void {this.disposed=true;this.cancelPending();this.queue.dispose()}
  /** Policy charge/counts only: no aliases, source URLs or native faces escape. */
  getSnapshot(){return {pendingCount:this.queue.size,preparation:this.queue.getSnapshot(),residency:this.cache.getSnapshot()}}

  /** Reserve BEFORE FontFace construction, register only after actual readiness,
   * then transfer ownership to the common resident cache. Stale completion is
   * retired, never published as the current source generation. */
  private async prepare(url:string,key:string,estimate:number,generation:number,signal:AbortSignal):Promise<FontLease> {
    const ticket=this.cache.reserve(estimate)
    let resource:FontResource|undefined,binary:FontBinaryInput|undefined,admitted=false
    const alias=`__chorono_font_${++nextAlias}`
    const owned:FontResource={alias,get ready(){return resource!.ready},dispose(){resource?.dispose();binary?.input.release()}}
    try {
      this.check(signal)
      if(this.inputSource){
        binary=await this.inputSource.readUrl(url,signal);this.check(signal)
        estimate=fontPolicyBytes(binary.metadata)
        if(!ticket.resize(estimate))throw new RangeError('Font metadata exceeds the managed resource budget.')
      }
      resource=this.decode({url,alias,data:binary?.input.buffer},signal)
      await resource.ready;this.check(signal)
      // Preserve custom backend aliases; only the browser backend promises ours.
      const retained:FontResource=binary?{get alias(){return resource!.alias},ready:resource.ready,dispose:()=>owned.dispose()}:resource
      const lease=this.cache.admit(generation===this.generation?key:null,retained,estimate,ticket,url)
      admitted=true;return lease
    } finally {if(!admitted)this.cache.discard(owned,ticket,url)}
  }
  /** Prevent stale producers from publishing after cancellation/disposal. */
  private check(signal?:AbortSignal):void {
    if(this.disposed)throw new Error('Font asset service is disposed.')
    if(signal?.aborted)throw cancelledJobError()
  }
}

/** Composition root; import creates no native font or timer. Metrics depend on
 * the text-domain port rather than importing this browser service in geometry. */
export const fontAssetService=new FontAssetService({budget:editorResourceBudget,executor:editorMediaPreparation})
configureTextFontFamilyResolver((css,assets)=>fontCatalog(assets).resolve(css,descriptor=>fontAssetService.peekAlias(descriptor.asset),false))

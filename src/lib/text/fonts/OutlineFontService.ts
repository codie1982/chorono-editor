import * as opentype from 'opentype.js'
import {ResidentResourceCache,type ResourceLease} from '../../resources/residency'
import {SharedPreparationQueue,withPreparationDeadline,cancelledJobError,type JobExecutor} from '../../resources/jobs'
import type {ResourceAllocator} from '../../resources/budget'
import {assetSourcePool} from '../../asset/sources'
import {FontBinaryReader,type FontBinarySource,type FontBinaryInput} from '../../asset/fonts/input'

interface ParsedFont { readonly font:opentype.Font; dispose():void }
export interface OutlineFontOptions {
  inputSource?:FontBinarySource
  parse?:(data:ArrayBuffer)=>opentype.Font
  budget?:ResourceAllocator
  executor?:JobExecutor
  maxBytes?:number
  maxEntries?:number
  timeoutMs?:number
}

/** Owns URL-keyed parsed outline fonts and their borrowed binary backing.
 * opentype may lazily retain DataViews: encoded input remains charged until the
 * parsed record's final pin/idle release. Parsed JS structures use an explicit
 * min 1 MiB / 8×encoded / 16×SFNT-reference policy, not measured heap. Native
 * FontFace registration is a different owner; this class never modifies fonts.
 * Reuses existing bounded queues, independent cancellation, dedupe, retirement
 * and idle eviction. No scene/undo data, unbounded singleton font or stuck rejected
 * promise is retained. All mutable state belongs to the instance. */
export class OutlineFontService {
  private readonly cache:ResidentResourceCache<ParsedFont>
  private readonly queue:SharedPreparationQueue<ResourceLease<ParsedFont>>
  private readonly inputs:FontBinarySource
  private readonly parse:(data:ArrayBuffer)=>opentype.Font
  private readonly timeoutMs:number
  private generation=0
  private disposed=false

  /** Construct finite local 32 MiB/8-record policy and optionally borrow host
   * budget/execution capacity. No IO, parsing or font registration starts here. */
  constructor(options:OutlineFontOptions={}) {
    this.timeoutMs=options.timeoutMs??15000
    if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<=0||this.timeoutMs>2147483647)throw new RangeError('Invalid outline-font deadline.')
    this.inputs=options.inputSource??new FontBinaryReader({budget:options.budget})
    this.parse=options.parse??(buffer=>opentype.parse(buffer,{lowMemory:true}))
    this.cache=new ResidentResourceCache({category:'font',label:'outline font',maxBytes:options.maxBytes??32*1024**2,
      maxEntries:options.maxEntries??8,budget:options.budget,dispose:record=>record.dispose()})
    this.queue=new SharedPreparationQueue({concurrency:2,maxQueued:128,executor:options.executor,label:'Outline font service',
      release:pin=>pin.release(),discard:(key,pin)=>{this.cache.invalidate(key,pin.value);pin.release()}})
  }

  /** Borrow a parsed font only during callback settlement. Concurrent same-URL
   * callers share parsing but own independent cancellation/pins. A callback must
   * not return/retain the Font or lazy glyph/path objects beyond this scope;
   * copied source geometry is caller-owned. No stale result is returned on abort. */
  async withFont<T>(url:string,consume:(font:opentype.Font)=>T|Promise<T>,options:{signal?:AbortSignal}={}):Promise<T> {
    this.check(options.signal)
    if(!url)throw new TypeError('Outline font source URL is required.')
    const generation=this.generation
    const pin=this.cache.acquire(url)??await withPreparationDeadline('Outline font',this.timeoutMs,options.signal,signal=>
      this.queue.request(url,native=>this.prepare(url,generation,native),lease=>lease.retain(),signal,
        ()=>{const source=assetSourcePool.retainUrls([url]);return ()=>source.release()}))
    try {this.check(options.signal);const result=await consume(pin.value.font);this.check(options.signal);return result}
    finally {pin.release()}
  }

  /** Retire lookup generations, preserving a conversion's existing font pin. */
  clear():void {this.generation++;this.queue.forget();this.cache.clear()}
  /** Reclaim parsed/input data only after the last conversion stopped using it. */
  clearIdle():void {this.cache.clearIdle()}
  /** Stop own admission, cancel queued consumers and preserve actual settlement. */
  dispose():void {this.disposed=true;this.queue.dispose();this.clear()}
  /** Detached policy/capacity diagnostics; no parsed font or source URL escapes. */
  getSnapshot(){return {preparation:this.queue.getSnapshot(),residency:this.cache.getSnapshot()}}

  /** One producer owns both the parser policy and binary backing until transfer.
   * Synchronous parsing cannot be interrupted; signal is checked before/after.
   * WOFF2 remains an explicit unsupported outline capability in opentype.js 2;
   * native FontFace supports that format independently. */
  private async prepare(url:string,generation:number,signal:AbortSignal):Promise<ResourceLease<ParsedFont>> {
    const ticket=this.cache.reserve(1024**2)
    let binary:FontBinaryInput|undefined,font:opentype.Font|undefined,admitted=false
    const owned:ParsedFont={get font(){if(!font)throw new Error('Outline font is not parsed.');return font},dispose(){binary?.input.release()}}
    try {
      this.check(signal);binary=await this.inputs.readUrl(url,signal);this.check(signal)
      if(binary.metadata.format==='woff2')throw new Error('WOFF2 outline extraction is unavailable; use TTF, OTF or WOFF.')
      const bytes=Math.max(1024**2,binary.metadata.encodedBytes*8,binary.metadata.sfntReferenceBytes*16)
      if(!ticket.resize(bytes))throw new RangeError('Parsed outline font exceeds the managed resource budget.')
      font=this.parse(binary.input.buffer);this.check(signal)
      if(!Number.isFinite(font.unitsPerEm)||font.unitsPerEm<=0)throw new Error('Outline font has invalid units per em.')
      const pin=this.cache.admit(generation===this.generation?url:null,owned,bytes,ticket,url)
      admitted=true;return pin
    } finally {if(!admitted)this.cache.discard(owned,ticket,url)}
  }
  /** Prevent stale producers/conversions publishing after a scope ends. */
  private check(signal?:AbortSignal):void {
    if(this.disposed)throw new Error('Outline font service is disposed.')
    if(signal?.aborted)throw cancelledJobError()
  }
}

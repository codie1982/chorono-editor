import {crc32} from '../../format/checksum'
import {BoundedBinaryReader} from '../../resources/io'
import type {ResourceLease} from '../../resources/residency'
import {OutputResources,OutputScope} from '../resources'
import {localZipHeader,centralZipHeader,zipEndRecord,type ZipEntry} from './ZipRecords'
export {crc32} from '../../format/checksum'

interface StoredEntry extends ZipEntry{blob:Blob}
export interface ZipWriterOptions{
  scope?:OutputScope
  resources?:OutputResources
  maxBytes?:number
  maxEntries?:number
}

/** Bounded STORE ZIP32 writer, preserving the existing headers/CRC/order.
 * Inputs are borrowed only during add; stored data is immutable Blob content,
 * not mutable/untracked caller Uint8Array references. addBlob computes CRC with
 * the authoritative bounded reader and keeps one Blob reference, avoiding a
 * retained full byte-array copy per frame. Native Blob composition may copy;
 * input+finished archive overlap is admitted before constructing the result.
 *
 * Application jobs inject a child scope sharing the editor ledger. Legacy
 * stand-alone construction has its own finite owner and preserves repeated raw
 * finish/add semantics; its raw results are caller-owned outside the ledger.
 * finishOwned consumes this writer and transfers a final result pin. dispose is
 * mandatory for retained application writers and waits for pending reads.
 * Native codec/Blob/GC storage is not claimed to be a physical RAM hard cap. */
export class ZipWriter{
  private readonly resources:OutputResources|undefined
  private readonly scope:OutputScope
  private readonly reader:BoundedBinaryReader
  private readonly entries:StoredEntry[]=[]
  private readonly maxBytes:number
  private readonly maxEntries:number
  private offset=0
  private centralSize=0
  private pending=false
  private closing=false
  private readonly ownsResources:boolean

  /** Defaults:128 MiB archive,4096 entries,1024 UTF-16 name units. No native
   * allocation occurs until add/finish; no archive-wide Uint8Array is created. */
  constructor(options:ZipWriterOptions={}){
    this.maxBytes=options.maxBytes??128*1024**2;this.maxEntries=options.maxEntries??4096
    if(!Number.isSafeInteger(this.maxBytes)||this.maxBytes<22||this.maxBytes>0xffffffff
      ||!Number.isSafeInteger(this.maxEntries)||this.maxEntries<1||this.maxEntries>65535)throw new RangeError('Invalid ZIP32 output limits.')
    this.ownsResources=!options.resources&&!options.scope
    this.resources=options.scope?undefined:options.resources??new OutputResources()
    this.scope=options.scope?.child()??new OutputScope(this.resources!)
    this.reader=new BoundedBinaryReader({maxBytes:Math.min(this.maxBytes,0x7fffffff),budget:this.scope.budget})
  }

  /** Synchronous compatibility input. Blob snapshots the bytes before return;
   * later caller mutation cannot invalidate the stored CRC. SharedArrayBuffer
   * input is explicitly unsupported, as with native Blob's ArrayBufferView port. */
  add(name:string,data:Uint8Array):void{
    this.check();const backing=data.buffer
    if(!(backing instanceof ArrayBuffer))throw new TypeError('ZIP input requires ordinary ArrayBuffer backing.')
    const prepared=this.entry(name,data.byteLength,0)
    let stored=false
    try{
      prepared.entry.crc=crc32(data)
      const held=this.scope.own(data.byteLength||1,()=>new Blob([new Uint8Array(backing,data.byteOffset,data.byteLength)]))
      try{this.store(prepared.entry,held.value);stored=true}catch(error){held.release();throw error}
    }finally{if(!stored)prepared.metadata.release()}
  }

  /** Borrow an already encoded immutable Blob through actual CRC read/cancel
   * completion. Stored ownership is admitted before caller releases its pin;
   * temporary overlap is conservative, not evidence of duplicate physical data.
   * Calls are sequential: overlapping adds fail explicitly rather than corrupt
   * offsets or accumulate an unbounded internal promise queue. */
  async addBlob(name:string,blob:Blob,signal?:AbortSignal):Promise<void>{
    this.check();this.entry(name,blob.size,0).metadata.release();this.pending=true
    let data:Awaited<ReturnType<BoundedBinaryReader['readResponse']>>|undefined
    try{
      data=await this.reader.readResponse(new Response(blob.stream()),{signal});this.scope.check(signal)
      if(this.closing)throw new Error('ZIP writer is disposed.')
      if(data.byteLength!==blob.size)throw new Error('ZIP Blob size differs from actual bytes.')
      const prepared=this.entry(name,blob.size,crc32(new Uint8Array(data.buffer)))
      let stored=false
      try{
        const held=this.scope.own(blob.size||1,()=>blob)
        try{this.store(prepared.entry,held.value);stored=true}catch(error){held.release();throw error}
      }finally{if(!stored)prepared.metadata.release()}
    }finally{data?.release();this.pending=false;if(this.closing)this.dispose()}
  }

  /** New owned handoff for application callers. Requires the caller's output
   * owner so final Blob and accumulated entries share the same host ledger.
   * Success consumes entries; errors also dispose them. */
  finishOwned():ResourceLease<Blob>{
    this.check()
    try{return this.build()}
    finally{this.dispose()}
  }

  /** Legacy non-consuming raw handoff. Bounded construction still applies;
   * caller owns the returned Blob beyond this method. Repeated finish and later
   * add are preserved. Application sequence output uses finishOwned instead. */
  finish():Blob{
    this.check();const lease=this.build()
    try{return lease.value}finally{lease.release()}
  }

  /** Idempotent request; a running bounded read keeps its tickets until actual
   * settlement. All other owned entries are then released, even on failure. */
  dispose():void{
    this.closing=true
    if(!this.pending){this.entries.length=0;this.scope.dispose();if(this.ownsResources)this.resources?.dispose()}
  }

  /** Encode bounded filename metadata before any data/native allocation. */
  private entry(name:string,size:number,crc:number){
    if(typeof name!=='string'||!name.length||name.length>1024||!Number.isSafeInteger(size)||size<0)throw new RangeError('Invalid ZIP entry name/size.')
    if(this.entries.length>=this.maxEntries)throw new RangeError('ZIP entry limit exceeded.')
    const metadata=this.scope.own(name.length*6+128,()=>new TextEncoder().encode(name))
    try{
      const nameBytes=metadata.value
      if(this.offset+30+nameBytes.length+size+this.centralSize+46+nameBytes.length+22>this.maxBytes)throw new RangeError('ZIP archive byte limit exceeded.')
      const entry:ZipEntry={nameBytes,crc,size,offset:this.offset}
      return {entry,metadata}
    }catch(error){metadata.release();throw error}
  }

  /** Admit metadata/header bytes before publishing an entry. The immutable data
   * Blob already has its own scope charge and no retained CRC input byte array. */
  private store(entry:ZipEntry,blob:Blob):void{
    this.entries.push({...entry,blob});this.offset+=30+entry.nameBytes.length+entry.size;this.centralSize+=46+entry.nameBytes.length
  }

  /** Construct headers and final native Blob under admitted input+output overlap.
   * No caller input buffer is cast to BlobPart or copied into one giant array. */
  private build():ResourceLease<Blob>{
    const temporary=this.scope.child(),total=this.offset+this.centralSize+22
    try{
      const parts:BlobPart[]=[]
      for(const entry of this.entries){
        const local=temporary.own(30+entry.nameBytes.length,()=>localZipHeader(entry))
        parts.push(local.value,entry.blob)
      }
      for(const entry of this.entries){
        const central=temporary.own(46+entry.nameBytes.length,()=>centralZipHeader(entry));parts.push(central.value)
      }
      parts.push(temporary.own(22,()=>zipEndRecord(this.entries.length,this.centralSize,this.offset)).value)
      return this.scope.budget.own(total,()=>new Blob(parts,{type:'application/zip'}),()=>{})
    }finally{temporary.dispose()}
  }
  /** No data/finalization can race an active add or revive a consumed writer. */
  private check():void{
    if(this.closing)throw new Error('ZIP writer is disposed.')
    if(this.pending)throw new Error('ZIP writer already has a pending entry.')
    this.scope.check()
  }
}

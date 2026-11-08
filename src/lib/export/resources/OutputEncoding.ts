import {measureJson,utf8ByteLength} from '../../format/json'
import {BoundedBinaryReader} from '../../resources/io'
import type {OutputScope} from './OutputScope'
import type {OutputHandle} from './types'

/** Convert borrowed bytes to one owned base64 string. Admission precedes both
 * the binary-string workspace and native btoa. The policy includes conservative
 * rope/flatten/chunk overlap; it is not a JS-engine physical-RAM measurement.
 * Input remains caller-owned throughout; returned scope borrow must not escape.
 * No alphabet/format change from existing btoa-based MCP serialization. */
export function outputBase64(scope:OutputScope,bytes:Uint8Array,maxBytes=24*1024**2,signal?:AbortSignal):OutputHandle<string>{
  scope.check(signal)
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||bytes.byteLength>maxBytes)throw new RangeError('Base64 input exceeds the transport byte limit.')
  const workspace=scope.own(Math.max(1,bytes.byteLength*8+65536),()=>null)
  try{
    let binary=''
    for(let i=0;i<bytes.length;i+=8192){scope.check(signal);binary+=String.fromCharCode(...Array.from(bytes.subarray(i,i+8192)))}
    return scope.own(Math.max(1,4*Math.ceil(bytes.length/3)*2),()=>btoa(binary))
  }finally{workspace.release()}
}

/** Stream a borrowed Blob through the existing actual-byte reader; never call
 * unbounded blob.arrayBuffer(). Native stream cancellation is awaited before
 * dropping its input reservation. Result string is owned by the supplied scope. */
export async function outputBlobBase64(scope:OutputScope,blob:Blob,maxBytes=24*1024**2,signal?:AbortSignal):Promise<OutputHandle<string>>{
  scope.check(signal)
  if(blob.size>maxBytes)throw new RangeError('Blob exceeds the transport byte limit.')
  const input=await new BoundedBinaryReader({maxBytes,budget:scope.budget}).readResponse(new Response(blob),{signal})
  try{return outputBase64(scope,new Uint8Array(input.buffer),maxBytes,signal)}finally{input.release()}
}

/** Admit the exact TextEncoder output before allocation, including empty input.
 * String ownership belongs to caller; the returned buffer is a scope borrow. */
export function outputUtf8(scope:OutputScope,text:string,maxBytes=24*1024**2):OutputHandle<Uint8Array<ArrayBuffer>>{
  const size=utf8ByteLength(text,maxBytes)
  return scope.own(Math.max(1,size),()=>new TextEncoder().encode(text))
}

/** Preflight exact serialized character/wire lengths without stringify; reserve
 * two UTF-16 string copies plus UTF-8 fetch-body policy BEFORE serialization.
 * Holding this handle through actual fetch settlement covers the owned reply
 * and conservative body-copy estimate. Browser/network/driver internals remain
 * opaque. Only plain JSON records are supported; serialization shape is unchanged.
 */
export function outputJson(scope:OutputScope,value:unknown,options:{maxBytes?:number;maxChars?:number;space?:0|2}={}):OutputHandle<string>{
  const measured=measureJson(value,{...options,maxChars:options.maxChars??48*1024**2})
  return scope.own(Math.max(1,measured.chars*4+measured.utf8Bytes),()=>JSON.stringify(value,null,options.space))
}

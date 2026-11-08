import type {BridgeJob} from '../protocol'
import {LIMITS} from '../protocol'
import {executeEditorJobInScope,type MCPHost} from '../editor'
import {OutputResources,editorOutputResources,outputJson} from '../../export/resources'

/** Execute and serialize one reply inside the same output lifetime. Consumer
 * borrows its body only until its returned promise settles (e.g. awaited fetch).
 * Cancellation never races native production or transport cleanup. The result,
 * strings, canvases and inputs remain owned until actual consumption completes.
 * Operation errors retain the existing reply.error shape; transport errors
 * propagate, and an aborted connection never publishes a stale reply.
 * This adds no retry: callers must not replay a mutation on delivery failure. */
export async function withEditorReply(job:BridgeJob,host:MCPHost,sessionId:string,
  consume:(body:string,signal:AbortSignal)=>Promise<void>,options:{signal?:AbortSignal;resources?:OutputResources}={}):Promise<{error?:string}>{
  const lease=await(options.resources??editorOutputResources).run(async(scope,signal)=>{
    let result:unknown,error:string|undefined
    try{result=await executeEditorJobInScope(job,host,scope,signal)}catch(failure){
      error=(failure instanceof Error?failure.message:String(failure)).slice(0,4096)
    }
    scope.check(signal)
    const body=outputJson(scope,{op:'reply',sessionId,jobId:job.id,result,error},{maxBytes:LIMITS.requestBytes,maxChars:LIMITS.requestBytes})
    await consume(body.value,signal);scope.check(signal)
    return {error}
  },{signal:options.signal})
  try{return lease.value}finally{lease.release()}
}

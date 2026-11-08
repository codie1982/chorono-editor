'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {ResourceLease} from '@/lib/resources/residency'
import {consumeOutput} from '@/lib/export/resources'

/** UI-owned output request. A document signal, explicit cancel or unmount makes
 * late results stale without pretending native work has stopped. Only the exact
 * current operation can publish progress, download, errors or completion.
 * Consumer may await native clipboard/write work while its result pin is live;
 * it must use context.isCurrent() before publishing after an await. A download
 * may retain an independent pin. Result releases only after consumer settlement.
 * State/abort ownership is per component. The shared output owner supplies
 * consumer capacity; this hook adds no poller, local queue or byte budget. */
export function useOutputOperation(documentSignal?:AbortSignal){
  const mounted=useRef(true),current=useRef<AbortController|null>(null),document=useRef(documentSignal)
  document.current=documentSignal
  const [busy,setBusy]=useState(false),[cancelling,setCancelling]=useState(false)
  const [progress,setProgress]=useState<{frame:number;total:number}|null>(null)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;current.current?.abort()}},[])

  /** A second click in the same render cannot submit duplicate jobs. Source
   * document identity is captured at invocation, not when a queued job starts. */
  const run=useCallback(async <T>(acquire:(signal:AbortSignal,progress:(frame:number,total:number)=>void)=>Promise<ResourceLease<T>>,
    consume:(lease:ResourceLease<T>,context:{signal:AbortSignal;isCurrent:()=>boolean})=>void|Promise<void>,onError?:(message:string)=>void):Promise<void>=>{
    if(current.current||!mounted.current)return
    const controller=new AbortController(),source=document.current,abort=()=>controller.abort()
    current.current=controller;setBusy(true);setCancelling(false);setProgress(null)
    source?.addEventListener('abort',abort,{once:true});if(source?.aborted)abort()
    const live=()=>mounted.current&&current.current===controller&&document.current===source&&!controller.signal.aborted
    let result:ResourceLease<T>|undefined
    try{
      result=await acquire(controller.signal,(frame,total)=>{if(live())setProgress({frame,total})})
      if(live())await consumeOutput(result,(_value,signal)=>consume(result!,{signal,isCurrent:()=>live()&&!signal.aborted}),{signal:controller.signal})
    }catch(error){if(live()&&!(error instanceof Error&&error.name==='AbortError'))onError?.(error instanceof Error?error.message:String(error))}
    finally{
      result?.release();source?.removeEventListener('abort',abort)
      if(current.current===controller){current.current=null;if(mounted.current){setBusy(false);setCancelling(false);setProgress(null)}}
    }
  },[])
  /** Cancel requests actual cleanup; busy stays true until producer settles. */
  const cancel=useCallback(()=>{if(current.current){current.current.abort();setCancelling(true)}},[])
  return {busy,cancelling,progress,run,cancel}
}

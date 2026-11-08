'use client'
import {useEffect,useRef,useState} from 'react'
import type {ChronoScene} from '@/lib/types'
import {acquireSceneText,type SceneTextKind,type TextOutputResult} from '@/lib/export/text'
import type {ResourceLease} from '@/lib/resources/residency'

interface Prepared{scene:ChronoScene;kind:SceneTextKind;signal?:AbortSignal;value:TextOutputResult}
/** Persistent preview pin, separate from one-shot output/download operations.
 * Source identity changes, document abort and unmount invalidate publication
 * and release the ready pin. Non-abortable preparation retains its backing
 * through actual completion. State holds only current text/metadata; no split
 * array/Blob sizing probe. StrictMode cancels only an obsolete consumer. */
export function useSceneTextPreview(scene:ChronoScene,kind:SceneTextKind,documentSignal?:AbortSignal){
  const [prepared,setPrepared]=useState<Prepared|null>(null),[error,setError]=useState('')
  const live=useRef<{scene:ChronoScene;kind:SceneTextKind;signal?:AbortSignal;lease?:ResourceLease<TextOutputResult>}>()
  useEffect(()=>{
    const controller=new AbortController(),current={scene,kind,signal:documentSignal,lease:undefined as ResourceLease<TextOutputResult>|undefined}
    live.current=current;setPrepared(null);setError('')
    const abort=()=>{controller.abort();current.lease?.release();current.lease=undefined;if(live.current===current){live.current=undefined;setPrepared(null)}}
    documentSignal?.addEventListener('abort',abort,{once:true});if(documentSignal?.aborted)abort()
    void acquireSceneText(scene,kind,{}, {signal:controller.signal}).then(lease=>{
      if(controller.signal.aborted||live.current!==current){lease.release();return}
      current.lease=lease;setPrepared({scene,kind,signal:documentSignal,value:lease.value})
    }).catch(failure=>{if(!controller.signal.aborted&&live.current===current)setError(failure instanceof Error?failure.message:String(failure))})
    return()=>{documentSignal?.removeEventListener('abort',abort);controller.abort();current.lease?.release();current.lease=undefined;if(live.current===current)live.current=undefined}
  },[scene,kind,documentSignal])
  const value=prepared?.scene===scene&&prepared.kind===kind&&prepared.signal===documentSignal&&live.current?.lease?prepared.value:null
  return {value,error,retain:()=>{
    if(!value||!live.current?.lease||live.current.scene!==scene||live.current.kind!==kind||live.current.signal!==documentSignal)throw new Error('Text preview is not ready.')
    return live.current.lease.retain()
  }}
}

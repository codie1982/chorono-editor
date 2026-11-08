'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {ChronoScene} from '@/lib/types'
import {assetSourcePool} from '@/lib/asset/sources'
import {SceneAutoSaveCoordinator,saveSceneToServer,type SceneSaveState,type SceneSaveStatus} from '@/lib/editor/persistence'

export type AutoSaveState=SceneSaveState
interface UseAutoSaveOptions{
  projectId:string;sceneId:string;interval_ms?:number;fallback_ms?:number
  documentSignal?:AbortSignal
  onStatusChange?:(state:AutoSaveState)=>void
  onError?:(error:Error)=>void
}

/** React adapter for one PATCH/CAS target. The coordinator owns one active and
 * one latest pending scene, finite retries and timers; SceneServerSave owns
 * budgeted serialization through actual network settlement. Target/document or
 * unmount invalidates old callbacks and cancels their consumer. Initial CAS
 * version remains the existing zero; loading/version negotiation is unchanged.
 * No stale scene retry closures are retained by React.
 */
export function useAutoSave(scene:ChronoScene|null,options:UseAutoSaveOptions){
  const [status,setStatus]=useState<SceneSaveStatus>({state:'idle',version:0,retryCount:0})
  const latest=useRef({scene,options});latest.current={scene,options}
  const owner=useRef<SceneAutoSaveCoordinator>()
  const {projectId,sceneId,interval_ms,fallback_ms,documentSignal}=options
  useEffect(()=>{
    const coordinator=new SceneAutoSaveCoordinator({intervalMs:interval_ms,fallbackMs:fallback_ms,
      retain:value=>assetSourcePool.retainAssets(value.assets),online:()=>navigator.onLine,
      save:(value,version,signal)=>saveSceneToServer(value,{projectId,sceneId,version},{signal}),
      onStatus:next=>{setStatus(next);latest.current.options.onStatusChange?.(next.state);if(next.error)latest.current.options.onError?.(next.error)},
    })
    owner.current=coordinator;setStatus({state:'idle',version:0,retryCount:0})
    const abort=()=>coordinator.dispose(),online=()=>{if(latest.current.scene)coordinator.request(latest.current.scene,true)}
    documentSignal?.addEventListener('abort',abort,{once:true});if(documentSignal?.aborted)abort()
    window.addEventListener('online',online)
    if(latest.current.scene)coordinator.request(latest.current.scene)
    return()=>{documentSignal?.removeEventListener('abort',abort);window.removeEventListener('online',online);coordinator.dispose();if(owner.current===coordinator)owner.current=undefined}
  },[projectId,sceneId,interval_ms,fallback_ms,documentSignal])
  useEffect(()=>{if(scene)owner.current?.request(scene)},[scene])
  const saveNow=useCallback(()=>{if(latest.current.scene)owner.current?.request(latest.current.scene,true)},[])
  return {state:status.state,lastSavedVersion:status.version,retryCount:status.retryCount,saveNow}
}

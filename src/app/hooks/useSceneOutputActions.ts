'use client'
import {useCallback} from 'react'
import type {ChronoScene} from '@/lib/types'
import {acquireSceneText,acquireTextDownload,type SceneTextKind} from '@/lib/export/text'
import {downloadOutput} from '@/lib/export/resources'
import {useOutputOperation} from '@/components/export/hooks/useOutputOperation'
import {toast} from '@/lib/toast/toast'
import { useSessionIdentity } from '@/components/editorSession/SessionOutputContext'
import { sessionOutputFilename } from '@/lib/editor/session/sessionIdentity'
import type { HistoryState } from '@/lib/editor/history'

/** File menu output orchestration only. Domain serialization/admission belongs
 * to export/text. The common operation hook handles document/unmount cancellation
 * and double clicks; native clipboard completion is awaited before releasing its
 * text pin. Download URL/pin handoff has its own finite ownership. No scene
 * mutation, filesystem handles or extra job queue is owned by this hook. */
export function useSceneOutputActions(scene:ChronoScene,documentSignal:AbortSignal,getHistory?:()=>HistoryState){
  const session=useSessionIdentity()
  const operation=useOutputOperation(documentSignal)
  const save=useCallback((kind:SceneTextKind)=>operation.run(
    signal=>acquireTextDownload(scene,kind,kind==='editor-json'&&session&&getHistory?{session:{sessionId:session.getId(),history:getHistory()}}:{}, {signal}),lease=>{
      const result=lease.value
      // Retain the existing runtime file naming and toast behavior.
      const filename=sessionOutputFilename(kind==='runtime-json'?`chorono-runtime-${Date.now()}.json`:result.filename,session?.getId())
      downloadOutput(lease,value=>value.blob,filename)
      toast.success(kind==='runtime-json'?'Runtime JSON exported':`Exported ${filename}`,{
        detail:result.warnings.length?result.warnings.join(' '):undefined,
      })
    },message=>toast.error('Export failed',{detail:message})),[scene,operation.run,session?.getId,getHistory])
  const saveSceneJson=useCallback(()=>save('editor-json'),[save])
  const exportSceneHtml=useCallback(()=>save('html'),[save])
  const exportRuntimeJson=useCallback(()=>save('runtime-json'),[save])
  const copySceneJson=useCallback(()=>operation.run(
    signal=>acquireSceneText(scene,'editor-json',{}, {signal}),async(lease,context)=>{
      await navigator.clipboard.writeText(lease.value.text)
      if(context.isCurrent())toast.success('Scene JSON copied to clipboard')
    },message=>toast.error('Clipboard write failed',{detail:message})),[scene,operation.run])
  return {saveSceneJson,copySceneJson,exportSceneHtml,exportRuntimeJson,busy:operation.busy}
}

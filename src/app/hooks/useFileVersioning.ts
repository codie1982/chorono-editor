'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {ChronoScene} from '@/lib/types'
import {assetSourcePool} from '@/lib/asset/sources'
import {SceneFileWriter,SceneAutoSaveCoordinator,type SceneWritable} from '@/lib/editor/persistence'
import type { HistoryState } from '@/lib/editor/history'
import { HistorySnapshotIndex } from '@/lib/editor/history/HistorySnapshotIndex'
import { sessionOutputFilename, validSessionId } from '@/lib/editor/session/sessionIdentity'

export type FileVersioningState='no-directory'|'idle'|'saving'|'saved'|'error'|'unsupported'
/** Platform directory capability, outside scene JSON/undo. Native and private
 * storage adapters share only file-open operations needed by this feature. */
export interface SceneDirectory{
  readonly name:string
  getFileHandle(name:string,options:{create:true}):Promise<{createWritable():Promise<SceneWritable>}>
  getDirectoryHandle?(name:string,options:{create:true}):Promise<SceneDirectory>
}
interface UseFileVersioningOptions{
  interval_ms?:number;fallback_ms?:number;snapshot_ms?:number;baseName?:string
  documentSignal?:AbortSignal
  sessionId?:string
  history?:HistoryState
  /** Optional host-native picker; browser composition uses showDirectoryPicker. */
  pickDirectory?:()=>Promise<SceneDirectory>
}
interface Selection{directory:SceneDirectory}
interface FolderOwner{
  writer:SceneFileWriter;autosave:SceneAutoSaveCoordinator;initializing:boolean;active:boolean
  snapshot():Promise<void>
}
/** Filesystem-safe version timestamp, unchanged local-time naming contract. */
function formatTimestamp(d:Date):string{
  const pad=(value:number)=>String(value).padStart(2,'0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}
/** Native picker is UI orchestration; writer/serialization never opens a picker. */
async function browserDirectory():Promise<SceneDirectory>{
  const picker=(window as Window&{showDirectoryPicker?:(options:{mode:string;id:string})=>Promise<SceneDirectory>}).showDirectoryPicker
  if(!picker)throw new Error('File System Access API is unavailable.')
  return picker.call(window,{mode:'readwrite',id:'chorono-scenes'})
}

/** Selected-folder persistence with bounded IO and current-scene coalescing.
 * One local writer serializes current/snapshot files, and the common autosave
 * coordinator retains only an active plus latest pending current scene. Text
 * and native writable cleanup share output admission through actual settlement.
 *
 * Picker resolves after the initial current+version writes, as before. StrictMode
 * replay/document replacement invalidates obsolete setup without publishing its
 * status. Session-aware versions keep timestamp naming under sessions/<sessionId>/
 * and include portable committed history; source-only host callers keep their
 * existing JSON contract.
 * No directory/native handles enter scene/undo. Timers/pending picker are released
 * on unmount; same-folder selection can intentionally create another version.
 */
export function useFileVersioning(scene:ChronoScene|null,options:UseFileVersioningOptions={}){
  const {interval_ms=500,fallback_ms=10000,snapshot_ms=600000,baseName='scene',documentSignal,sessionId}=options
  const [mounted,setMounted]=useState(false),[isSupported,setSupported]=useState(false)
  const [state,setState]=useState<FileVersioningState>('no-directory'),[selection,setSelection]=useState<Selection|null>(null)
  const [lastSavedAt,setLastSavedAt]=useState<Date|null>(null),[lastSnapshotAt,setLastSnapshotAt]=useState<Date|null>(null),[snapshotCount,setSnapshotCount]=useState(0)
  const latest=useRef({scene,options});latest.current={scene,options}
  const snapshots=useRef<HistorySnapshotIndex>()
  if(!snapshots.current)snapshots.current=new HistorySnapshotIndex()
  const currentInput=()=>{const value=latest.current.scene,history=latest.current.options.history
    return value&&history&&history.present===value?snapshots.current!.carrier(history):value}
  const owner=useRef<FolderOwner>(),alive=useRef(false),picking=useRef(false)
  const initialized=useRef<WeakSet<Selection>>(),statusTimer=useRef<ReturnType<typeof setTimeout>>()
  if(!initialized.current)initialized.current=new WeakSet<Selection>()
  const pendingPicker=useRef<{selection:Selection;resolve():void;reject(error:unknown):void}>()
  useEffect(()=>{
    alive.current=true;setMounted(true)
    const supported=!!latest.current.options.pickDirectory||'showDirectoryPicker' in window
    setSupported(supported);if(!supported)setState('unsupported')
    return()=>{alive.current=false;clearTimeout(statusTimer.current);pendingPicker.current?.reject(new Error('Folder selection was cancelled.'));pendingPicker.current=undefined}
  },[])
  useEffect(()=>{
    if(!selection)return
    const writer=new SceneFileWriter(),directory=selection.directory
    let lastWritten:WeakRef<ChronoScene>|undefined
    const current=():boolean=>alive.current&&owner.current===context&&context.active&&!documentSignal?.aborted
    const saved=()=>{if(current()){setState('saved');clearTimeout(statusTimer.current);statusTimer.current=setTimeout(()=>{if(current())setState(value=>value==='saved'?'idle':value)},2000)}}
    /** Validate before deriving a filename or opening a native handle. */
    const filename=(suffix:string)=>{if(!baseName.length||baseName.length>512)throw new RangeError('Scene filename base must contain 1–512 characters.');return baseName+suffix}
    let target:Promise<SceneDirectory>|undefined
    const write=(name:string,value:ChronoScene,signal=documentSignal)=>{
      const history=snapshots.current!.history(value)
      return writer.write(history?.present??value,async()=>{
        if(sessionId&&!validSessionId(sessionId))throw new Error('Invalid save session ID.')
        if(!target)target=sessionId&&directory.getDirectoryHandle
          ?directory.getDirectoryHandle('sessions',{create:true}).then(root=>root.getDirectoryHandle!(sessionId,{create:true}))
          :Promise.resolve(directory)
        const root=await target
        const file=await root.getFileHandle(sessionId&&!directory.getDirectoryHandle?sessionOutputFilename(name,sessionId):name,{create:true});return file.createWritable()
      },signal,sessionId&&history?{sessionId,history}:undefined)
    }
    const context:FolderOwner={writer,active:true,initializing:!initialized.current!.has(selection),
      autosave:new SceneAutoSaveCoordinator({intervalMs:interval_ms,fallbackMs:fallback_ms,
        retain:value=>assetSourcePool.retainAssets(value.assets),
        save:async(value,version,signal)=>{
          if(lastWritten?.deref()!==value){await write(filename('.json'),value,signal);lastWritten=new WeakRef(value)}
          return version+1
        },
        onStatus:status=>{if(!current())return;clearTimeout(statusTimer.current);setState(status.state==='offline'?'error':status.state);if(status.state==='saved')setLastSavedAt(new Date())},
      }),
      snapshot:async()=>{
        const value=currentInput();if(!value||!current())return
        clearTimeout(statusTimer.current);setState('saving')
        try{
          await write(filename(`_${formatTimestamp(new Date())}.json`),value)
          if(current()){setLastSnapshotAt(new Date());setSnapshotCount(count=>count+1);saved()}
        }catch(error){if(current()&&!(error instanceof Error&&error.name==='AbortError'))setState('error');throw error}
      },
    }
    owner.current=context
    const abort=()=>{context.active=false;context.autosave.dispose();writer.dispose();clearTimeout(statusTimer.current)}
    documentSignal?.addEventListener('abort',abort,{once:true});if(documentSignal?.aborted)abort()
    void(async()=>{
      try{
        if(context.initializing&&latest.current.scene){
          const value=currentInput()!;setState('saving')
          await write(filename('.json'),value);lastWritten=new WeakRef(value)
          if(current()){setLastSavedAt(new Date());await context.snapshot()}
        }
        if(!current())return
        initialized.current!.add(selection);context.initializing=false
        if(pendingPicker.current?.selection===selection){pendingPicker.current.resolve();pendingPicker.current=undefined}
        const value=currentInput();if(value)context.autosave.request(value)
      }catch(error){
        if(current()){
          setState('error');context.initializing=false
          if(pendingPicker.current?.selection===selection){pendingPicker.current.reject(error);pendingPicker.current=undefined}
        }
      }
    })()
    return()=>{documentSignal?.removeEventListener('abort',abort);abort();if(owner.current===context)owner.current=undefined}
  },[selection,baseName,interval_ms,fallback_ms,documentSignal,sessionId])
  useEffect(()=>{const value=currentInput();if(value&&owner.current&&!owner.current.initializing)owner.current.autosave.request(value)},[scene,options.history])
  const saveSnapshotNow=useCallback(async()=>{
    if(!owner.current){setState(isSupported?'no-directory':'unsupported');return}
    try{await owner.current.snapshot()}catch{/* The current owner publishes its error; stale owners publish nothing. */}
  },[isSupported])
  useEffect(()=>{
    if(!selection||!Number.isSafeInteger(snapshot_ms)||snapshot_ms<1||snapshot_ms>2147483647)return
    const timer=setInterval(()=>{void saveSnapshotNow()},snapshot_ms)
    return()=>clearInterval(timer)
  },[selection,snapshot_ms,saveSnapshotNow])
  const pickDirectory=useCallback(async()=>{
    if(picking.current)return;picking.current=true
    try{
      const directory=await(latest.current.options.pickDirectory??browserDirectory)()
      if(!alive.current)return
      const chosen={directory}
      const ready=new Promise<void>((resolve,reject)=>{pendingPicker.current={selection:chosen,resolve,reject}})
      setSelection(chosen);setState('saving');await ready
    }catch(error){if(alive.current&&!(error instanceof Error&&error.name==='AbortError'))setState('error')}
    finally{picking.current=false}
  },[])
  return {mounted,state,directoryName:selection?.directory.name??null,lastSavedAt,lastSnapshotAt,snapshotCount,isSupported,pickDirectory,saveSnapshotNow}
}

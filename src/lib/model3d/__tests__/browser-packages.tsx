import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { useEditorState } from '@/app/hooks/useEditorState'
import { useItemDetail } from '@/components/detail/useItemDetail'
import { ItemDetailWorkspace } from '@/components/detail/ItemDetailWorkspace'
import { ModelDetailHeaderHost } from '@/components/detail/model3d/ModelDetailHeaderHost'
import FileMenu from '@/components/TopToolbar/FileMenu'
import ShortcutHelpModal from '@/components/modals/ShortcutHelpModal'
import { packageScene } from './packageScene'
import { checkPackages } from './checkPackages'
import type { ChronoScene } from '../../types'
import type { MCPHost } from '../../mcp/editor'
import '@/lib/registry/bootstrap'
/** Isolated fixture uses the production editor/detail UI. No user recovery,
 * network telemetry, live MCP session or main application state is touched. */
function Host({initial}:{initial:ChronoScene}) {
  const editor=useEditorState(initial),detail=useItemDetail(editor),[report,setReport]=useState<unknown>({status:'Ready'}),[busy,setBusy]=useState(false),[help,setHelp]=useState(false),canvases=useRef<HTMLCanvasElement[]>([]),read=useRef(editor);read.current=editor
  const mcp=useMemo<MCPHost>(()=>({get editor(){return read.current},assets:new Map(),selectedTimelineId:'outer',currentTimeMs:0,isPlaying:false,getLiveFrame:()=>evaluateSceneFrame(read.current.scene,0),getRuntimeState:()=>({}),setRuntimeTest:()=>{},selectTimeline:()=>{},isolateTimelines:()=>{},seek:()=>{},playToggle:()=>{},setSpeed:()=>{},setParameter:()=>{},dispatchEvent:()=>{}}),[])
  useLayoutEffect(()=>{document.title='Chorono 3D0–6 acceptance'},[])
  return <main className="bg-gray-950 text-gray-200 min-h-screen p-3">
    <div className="flex gap-3 items-center mb-2"><h1>3D0–6 acceptance</h1>
      <button id="run" disabled={busy||!!detail.session} onClick={async()=>{setBusy(true);try{setReport(await checkPackages(mcp,canvases.current))}catch(e){setReport({passed:false,error:String(e)})}finally{setBusy(false)}}}>Run rendered acceptance</button>
      <button id="open" onClick={()=>detail.open('model')}>Open 3D detail</button>
      <button id="undo" onClick={editor.undo}>Main Undo</button><button id="redo" onClick={editor.redo}>Main Redo</button>
    </div>
    <output id="state" className="text-xs block max-h-16 overflow-auto break-all">{JSON.stringify({revision:editor.getRevision(),undo:editor.committedHistory.past.length,open:!!detail.session,model:editor.scene.layers[1].model3d})}</output>
    {detail.session?.animation && <ModelDetailHeaderHost name={detail.session.layer.name} fileMenu={<FileMenu detailEditing filename={editor.scene.composition.id}
      onRename={()=>{}} onNewScene={()=>{}} onOpenSceneJson={()=>{}} onSaveSceneJson={()=>{}} onExportRuntime={()=>{}}
      onCopySceneJson={()=>{}} onResetLayout={()=>{}} onShowShortcuts={()=>setHelp(true)} />} />}
    {help && <ShortcutHelpModal initialMode="3d" onClose={()=>setHelp(false)} />}
    <div className="relative border border-gray-700 mt-2" style={{height:720}}>
      {detail.session?<ItemDetailWorkspace session={detail.session} editor={editor} timeMs={0} onClose={detail.close}/>:<div className="grid grid-cols-3 gap-2 p-3">{['Viewport','MCP PNG','Raster PNG'].map((title,i)=><figure key={title}><figcaption>{title}</figcaption><canvas ref={c=>{if(c)canvases.current[i]=c}} className="w-full"/></figure>)}</div>}
    </div>
    <pre id="report" className="text-xs whitespace-pre-wrap">{JSON.stringify(report,null,2)}</pre>
  </main>
}
packageScene().then(initial=>createRoot(document.getElementById('app')!).render(<Host initial={initial}/>)).catch(e=>{document.body.textContent=String(e)})

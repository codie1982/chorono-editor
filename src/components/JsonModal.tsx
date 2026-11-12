'use client'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import { useEffect,useRef,useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import {useSceneTextPreview} from './export/hooks/useSceneTextPreview'
import {useOutputOperation} from './export/hooks/useOutputOperation'
import {editorOutputResources,downloadOutput} from '@/lib/export/resources'
import { useSessionOutputFilename } from './editorSession/SessionOutputContext'

interface Props {
  scene: ChronoScene
  onClose: () => void
  documentSignal?:AbortSignal
  onSaveProject?:()=>void
}

type Mode = 'editor' | 'runtime'

/** Full JSON stays output-owned for copy/download. Display is capped at 200000
 * UTF-16 units; mode/document changes release obsolete pins and timers. */
export default function JsonModal({ scene, onClose,documentSignal,onSaveProject }: Props) {
  const sessionFilename=useSessionOutputFilename()
  const [mode,   setMode]   = useState<Mode>('editor')
  const [copied, setCopied] = useState(false)

  const preview=useSceneTextPreview(scene,mode==='runtime'?'legacy-runtime-json':'editor-json',documentSignal)
  const operation=useOutputOperation(documentSignal),timer=useRef<ReturnType<typeof setTimeout>>()
  const [actionError,setActionError]=useState(''),result=preview.value,json=result?.text??''
  useEffect(()=>{setCopied(false);setActionError('');clearTimeout(timer.current);return()=>clearTimeout(timer.current)},[scene,mode])

  const handleCopy=()=>operation.run(async()=>preview.retain(),async(lease,context)=>{
    setActionError('');await navigator.clipboard.writeText(lease.value.text)
    if(context.isCurrent()){setCopied(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setCopied(false),2000)}
  },setActionError)

  const handleDownload=()=>{if(mode==='editor'&&onSaveProject){onSaveProject();return}return operation.run(async()=>preview.retain(),lease=>{
    setActionError('')
    const value=lease.value,blob=editorOutputResources.own(Math.max(1,value.byteLength),()=>new Blob([value.text],{type:value.mimeType}),()=>{})
    try{downloadOutput(blob,item=>item,sessionFilename(`${scene.composition.id}.${mode==='runtime'?'runtime':'editor'}.json`))}finally{blob.release()}
  },setActionError)}

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label="Project JSON" className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl
                      flex flex-col max-h-[90vh]">

        {/* Title */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">
              {scene.composition.id}.{mode === 'runtime' ? 'runtime' : 'editor'}.json
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {result?`${result.lines} lines · ${(result.byteLength/1024).toFixed(1)} KB`:'Preparing JSON…'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DocumentationHelp topic={mode === 'runtime' ? 'export/runtime-json' : 'export/project-json'} compact />
            {/* Mode toggle */}
            <div className="flex rounded overflow-hidden border border-gray-600">
              <button
                onClick={() => setMode('editor')}
                disabled={operation.busy}
                className={`px-2 py-1.5 text-xs ${
                  mode === 'editor' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
                title="Includes editor metadata"
              >Editor</button>
              <button
                onClick={() => setMode('runtime')}
                disabled={operation.busy}
                className={`px-2 py-1.5 text-xs ${
                  mode === 'runtime' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
                title="Stripped, runtime-ready format"
              >Runtime</button>
            </div>
            <button
              onClick={handleCopy}
              disabled={!result||operation.busy}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors
                ${copied ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!result||operation.busy}
              className="px-3 py-1.5 text-xs rounded font-medium bg-blue-600 hover:bg-blue-500 text-white"
            >
              ↓ Download
            </button>
            <button
              onClick={onClose}
              aria-label="Close JSON"
              className="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-400"
            >✕</button>
          </div>
        </div>

        {actionError&&<p role="alert" className="p-2 text-xs text-red-400">{actionError}</p>}
        <pre className="flex-1 overflow-auto p-4 text-xs text-gray-300 font-mono leading-relaxed
                        bg-gray-950 rounded-b-lg">
          <code>{preview.error||json.slice(0,200000)}{json.length>200000&&'\n… Preview limited to 200,000 characters. Copy or download includes the complete JSON.'}</code>
        </pre>
      </div>
    </div>
  )
}

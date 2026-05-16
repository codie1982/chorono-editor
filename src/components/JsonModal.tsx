'use client'
import { useMemo, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import { exportToRuntimeJSON } from '@/lib/export/runtimeExport'

interface Props {
  scene: ChronoScene
  onClose: () => void
}

type Mode = 'editor' | 'runtime'

export default function JsonModal({ scene, onClose }: Props) {
  const [mode,   setMode]   = useState<Mode>('editor')
  const [copied, setCopied] = useState(false)

  const json = useMemo(
    () => mode === 'runtime'
      ? exportToRuntimeJSON(scene)
      : JSON.stringify(scene, null, 2),
    [scene, mode],
  )

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([json], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${scene.composition.id}.${mode === 'runtime' ? 'runtime' : 'editor'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-2xl
                      flex flex-col max-h-[90vh]">

        {/* Title */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-200">
              {scene.composition.id}.{mode === 'runtime' ? 'runtime' : 'editor'}.json
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {json.split('\n').length} lines · {(new Blob([json]).size / 1024).toFixed(1)} KB
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex rounded overflow-hidden border border-gray-600">
              <button
                onClick={() => setMode('editor')}
                className={`px-2 py-1.5 text-xs ${
                  mode === 'editor' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
                title="Includes editor metadata"
              >Editor</button>
              <button
                onClick={() => setMode('runtime')}
                className={`px-2 py-1.5 text-xs ${
                  mode === 'runtime' ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
                title="Stripped, runtime-ready format"
              >Runtime</button>
            </div>
            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors
                ${copied ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 text-xs rounded font-medium bg-blue-600 hover:bg-blue-500 text-white"
            >
              ↓ Download
            </button>
            <button
              onClick={onClose}
              className="px-2 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-400"
            >✕</button>
          </div>
        </div>

        <pre className="flex-1 overflow-auto p-4 text-xs text-gray-300 font-mono leading-relaxed
                        bg-gray-950 rounded-b-lg">
          <code>{json}</code>
        </pre>
      </div>
    </div>
  )
}

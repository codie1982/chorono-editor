'use client'
// ── ImportUrlModal ────────────────────────────────────────────────────────────
// Prompts for a remote asset URL, then routes it through the import pipeline.
// Only https is accepted (http allowed for localhost) — enforced by UrlValidator.

import { useState } from 'react'

interface Props {
  onImport: (url: string) => void
  onClose:  () => void
}

export default function ImportUrlModal({ onImport, onClose }: Props) {
  const [url, setUrl] = useState('')

  const looksValid = /^https?:\/\/.+/i.test(url.trim())

  function submit() {
    if (!looksValid) return
    onImport(url.trim())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[420px] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-100">Import from URL</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
        </div>

        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Asset URL</label>
        <input
          autoFocus
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder="https://example.com/logo.svg"
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none focus:border-blue-500"
        />
        <p className="mt-2 text-[10px] text-gray-500 leading-relaxed">
          Only <span className="text-gray-400">https://</span> URLs are allowed (http for localhost).
          Images, SVG, video, audio, fonts and Lottie are supported.
        </p>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-[11px] px-3 py-1 rounded text-gray-300 hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!looksValid}
            className="text-[11px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}

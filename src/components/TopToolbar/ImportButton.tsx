'use client'
// ── ImportButton ──────────────────────────────────────────────────────────────
//
// Always-visible toolbar entry point for the universal import pipeline.
// Opens a multi-file picker; selected files are routed through useImport →
// ImportManager (atomic undo, library registration, toast reporting).

import { useRef } from 'react'
import { IMPORT_ACCEPT, IMPORT_FORMATS_LABEL } from '@/lib/import/acceptFormats'

interface Props {
  onImportFiles: (files: FileList | File[]) => void
}

export default function ImportButton({ onImportFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) onImportFiles(files)
    e.target.value = '' // allow re-picking the same file
  }

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        title={`Import — ${IMPORT_FORMATS_LABEL}`}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded
                   bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
      >
        <span className="text-sm leading-none">⤓</span> Import
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
    </>
  )
}

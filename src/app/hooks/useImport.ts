'use client'
// ── useImport ─────────────────────────────────────────────────────────────────
//
// React integration for the universal import pipeline (BL-04–06).
// Wires the ImportManager singleton into the editor: route any File through
// importManager.importFile() → atomic EditorCommand → dispatchCommand().
//
// Additive: existing per-type handlers in page.tsx keep working. New UI
// (drag-drop, unified import button) should prefer this hook so every format
// flows through one pipeline with consistent reporting + atomic undo.

import { useCallback, useEffect, useRef, useState } from 'react'
import { importManager }       from '@/lib/import/ImportManager'
import { initImportPipeline }  from '@/lib/import/initImportPipeline'
import { toast }               from '@/lib/toast/toast'
import type { EditorCommand }  from '@/lib/editor/commands-keyframe'
import type { ImportResult, ImportProgress } from '@/lib/import/types'

export interface UseImportOptions {
  /** Dispatch the atomic import command into the editor (one undo step). */
  dispatchCommand: (cmd: EditorCommand) => void
  /** Called with the first created layer id so the editor can select it. */
  onSelectLayer?: (id: string) => void
}

export interface UseImportReturn {
  /** Import a single File. Returns the result or null on failure. */
  importFile: (file: File) => Promise<ImportResult | null>
  /** Import many files sequentially. Returns successful results. */
  importFiles: (files: FileList | File[]) => Promise<ImportResult[]>
  /** Check whether a file is importable before committing. */
  canImport: (file: File) => Promise<boolean>
  /** True while an import is running. */
  importing: boolean
  /** Latest progress event (for a progress UI). */
  progress: ImportProgress | null
}

export function useImport({ dispatchCommand, onSelectLayer }: UseImportOptions): UseImportReturn {
  const [importing, setImporting] = useState(false)
  const [progress, setProgress]   = useState<ImportProgress | null>(null)

  // Register all built-in handlers exactly once.
  useEffect(() => { initImportPipeline() }, [])

  // Keep latest callbacks in refs so importFile identity stays stable.
  const dispatchRef = useRef(dispatchCommand)
  const selectRef   = useRef(onSelectLayer)
  dispatchRef.current = dispatchCommand
  selectRef.current   = onSelectLayer

  const importFile = useCallback(async (file: File): Promise<ImportResult | null> => {
    setImporting(true)
    setProgress(null)
    try {
      const result = await importManager.importFile(file, undefined, (p) => setProgress(p))

      // Surface fatal errors without committing.
      if (result.errors.some(e => e.fatal)) {
        const first = result.errors.find(e => e.fatal)!
        toast.error(`Import failed: ${file.name}`, { detail: first.message })
        return null
      }

      // Commit the atomic command (assets + layers + tracks in one undo step).
      const command = result.commands[0]
      if (command) dispatchRef.current(command)

      // Select the first created layer, if any.
      const firstLayer = result.layers[0]
      if (firstLayer) selectRef.current?.(firstLayer.id)

      // Report outcome.
      const { assets, layers } = result.report.created
      const parts: string[] = []
      if (layers) parts.push(`${layers} layer${layers === 1 ? '' : 's'}`)
      if (assets) parts.push(`${assets} asset${assets === 1 ? '' : 's'}`)
      const summary = parts.length > 0 ? parts.join(', ') : 'no editable content'

      const warningCount = result.warnings.length
      if (warningCount > 0) {
        toast.warning(`Imported ${file.name} (${summary})`, {
          detail: `${warningCount} warning${warningCount === 1 ? '' : 's'} — see import report`,
        })
        console.info(`[import] ${file.name} warnings:`, result.warnings)
      } else {
        toast.success(`Imported ${file.name}`, { detail: summary })
      }

      return result
    } catch (err) {
      toast.error(`Import failed: ${file.name}`, { detail: (err as Error).message })
      console.error('[import] failed:', file.name, err)
      return null
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }, [])

  const importFiles = useCallback(async (files: FileList | File[]): Promise<ImportResult[]> => {
    const list = Array.from(files)
    const results: ImportResult[] = []
    for (const file of list) {
      const r = await importFile(file)
      if (r) results.push(r)
    }
    return results
  }, [importFile])

  const canImport = useCallback(async (file: File): Promise<boolean> => {
    const { supported } = await importManager.canImport(file)
    return supported
  }, [])

  return { importFile, importFiles, canImport, importing, progress }
}

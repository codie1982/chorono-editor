'use client'
// ── useImport ─────────────────────────────────────────────────────────────────
//
// React integration for the universal import pipeline (BL-04–06).
// Wires the ImportManager singleton into the editor: route any source through
// importManager → atomic EditorCommand → dispatchCommand().
//
// Sources: local files, remote URLs (https), clipboard. Each shares the same
// commit + reporting logic so behaviour is consistent everywhere.

import { useCallback, useEffect, useRef, useState } from 'react'
import { importManager }       from '@/lib/import/ImportManager'
import { initImportPipeline }  from '@/lib/import/initImportPipeline'
import { toast }               from '@/lib/toast/toast'
import type { EditorCommand }  from '@/lib/editor/commands-keyframe'
import type { ImportResult, ImportProgress, ImportPreflight } from '@/lib/import/types'

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
  /** Import from a remote URL (https; http only for localhost). */
  importUrl: (url: string) => Promise<ImportResult | null>
  /** Import an image from the system clipboard. */
  importFromClipboard: () => Promise<ImportResult | null>
  /** Run preflight analysis (summary + warnings) without committing. */
  preview: (file: File) => Promise<ImportPreflight | null>
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

  // Keep latest callbacks in refs so the importer identities stay stable.
  const dispatchRef = useRef(dispatchCommand)
  const selectRef   = useRef(onSelectLayer)
  dispatchRef.current = dispatchCommand
  selectRef.current   = onSelectLayer

  // Shared: commit a completed result and report it. `label` names the source.
  const commitResult = useCallback((result: ImportResult, label: string): ImportResult | null => {
    // Surface fatal errors without committing.
    if (result.errors.some(e => e.fatal)) {
      const first = result.errors.find(e => e.fatal)!
      toast.error(`Import failed: ${label}`, { detail: first.message })
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
      toast.warning(`Imported ${label} (${summary})`, {
        detail: `${warningCount} warning${warningCount === 1 ? '' : 's'} — see import report`,
      })
      console.info(`[import] ${label} warnings:`, result.warnings)
    } else {
      toast.success(`Imported ${label}`, { detail: summary })
    }
    return result
  }, [])

  const importFile = useCallback(async (file: File): Promise<ImportResult | null> => {
    setImporting(true)
    setProgress(null)
    try {
      const result = await importManager.importFile(file, undefined, (p) => setProgress(p))
      return commitResult(result, file.name)
    } catch (err) {
      toast.error(`Import failed: ${file.name}`, { detail: (err as Error).message })
      console.error('[import] failed:', file.name, err)
      return null
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }, [commitResult])

  const importFiles = useCallback(async (files: FileList | File[]): Promise<ImportResult[]> => {
    const list = Array.from(files)
    const results: ImportResult[] = []
    for (const file of list) {
      const r = await importFile(file)
      if (r) results.push(r)
    }
    return results
  }, [importFile])

  const importUrl = useCallback(async (url: string): Promise<ImportResult | null> => {
    const trimmed = url.trim()
    if (!trimmed) return null
    const label = trimmed.split('/').pop() || trimmed
    setImporting(true)
    setProgress(null)
    try {
      const result = await importManager.importUrl(trimmed, undefined, (p) => setProgress(p))
      return commitResult(result, label)
    } catch (err) {
      toast.error('Import from URL failed', { detail: (err as Error).message })
      console.error('[import] url failed:', trimmed, err)
      return null
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }, [commitResult])

  const importFromClipboard = useCallback(async (): Promise<ImportResult | null> => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
      toast.error('Clipboard import not supported in this browser')
      return null
    }
    setImporting(true)
    setProgress(null)
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const result = await importManager.importClipboardItem(item, undefined, (p) => setProgress(p))
        if (result) return commitResult(result, 'clipboard')
      }
      toast.info('No importable image found on the clipboard')
      return null
    } catch (err) {
      toast.error('Clipboard import failed', { detail: (err as Error).message })
      console.error('[import] clipboard failed:', err)
      return null
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }, [commitResult])

  const preview = useCallback(async (file: File): Promise<ImportPreflight | null> => {
    try {
      return await importManager.preflight(file)
    } catch (err) {
      console.error('[import] preflight failed:', file.name, err)
      return null
    }
  }, [])

  const canImport = useCallback(async (file: File): Promise<boolean> => {
    const { supported } = await importManager.canImport(file)
    return supported
  }, [])

  return { importFile, importFiles, importUrl, importFromClipboard, preview, canImport, importing, progress }
}

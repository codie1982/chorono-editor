'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { importManager, type ImportManager } from '@/lib/import/ImportManager'
import { initImportPipeline } from '@/lib/import/initImportPipeline'
import { toast } from '@/lib/toast/toast'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { ImportResult, ImportProgress, ImportPreflight, SpriteImportOptions } from '@/lib/import/types'
import { releaseImportSources } from '@/lib/import/resources/importSources'
import { ImportActivity, type ImportOperation } from '@/lib/import/lifecycle/ImportActivity'
import { editorSceneDocumentLoader, type SceneDocumentSource } from '@/lib/editor/document'
import type { ChronoScene } from '@/lib/types'
import { reportImportResult } from './import/reportImportResult'

type ImportPort = Pick<ImportManager, 'importFile' | 'importFileAs' | 'importUrl' | 'importClipboardItem' | 'preflight' | 'canImport'>
export interface UseImportOptions {
  dispatchCommand: (command: EditorCommand) => void
  onSelectLayer?: (id: string) => void
  selectedTimelineId?: string | null
  currentTimeMs?: number
  /** Stable getter for runtime document identity, not scene ID/revision. Omit
   * only in standalone hosts whose document lives exactly as long as this hook. */
  getDocumentSignal?: () => AbortSignal
  /** Injectable routing contract for private hosts/tests; default app singleton. */
  manager?: ImportPort
  /** Project-source preparation only; caller controls actual reset/adoption. */
  sceneLoader?: SceneDocumentSource
}
export interface UseImportReturn {
  /** Latest open wins; onOpen is synchronous and may reset the document. */
  openScene: (file: File, onOpen: (scene: ChronoScene) => void, onError?: (error: Error) => void) => Promise<boolean>
  importFile: (file: File) => Promise<ImportResult | null>
  importFiles: (files: FileList | File[]) => Promise<ImportResult[]>
  importUrl: (url: string) => Promise<ImportResult | null>
  importFromClipboard: () => Promise<ImportResult | null>
  importSpriteSheet: (file: File, options: SpriteImportOptions) => Promise<ImportResult | null>
  preview: (file: File) => Promise<ImportPreflight | null>
  canImport: (file: File) => Promise<boolean>
  importing: boolean
  activeCount: number
  settlingCount: number
  label: string | null
  progress: ImportProgress | null
  cancel: () => void
}

/** Document-scoped UI integration for every import entry point. Each action
 * captures placement and document once; multi-file actions cannot spill into a
 * replacement document. Cancellation stops publication/UI immediately while
 * native jobs keep their actual settlement/byte owners. Sync dispatch adopts
 * source leases before creator release. Late success/failure/progress is quiet.
 * Injected managers remain externally owned; this hook never cancels a global
 * queue. Mutable request controllers never enter undo or serialized scene data. */
export function useImport(options: UseImportOptions): UseImportReturn {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const fallback = useRef<AbortController | null>(null)
  if (!fallback.current) fallback.current = new AbortController()
  const getDocumentSignal = useCallback(() => optionsRef.current.getDocumentSignal?.() ?? fallback.current!.signal, [])
  const activityRef = useRef<ImportActivity | null>(null)
  if (!activityRef.current) activityRef.current = new ImportActivity()
  const activity = activityRef.current
  const latestOpen = useRef<ImportOperation | null>(null)
  const status = useSyncExternalStore(activity.subscribe, activity.getSnapshot, activity.getSnapshot)
  useLayoutEffect(() => { activity.start(); return () => activity.stop() }, [activity])
  useEffect(() => { if (!options.manager) initImportPipeline() }, [options.manager])

  /** Transfer only to the captured live document; always release creator leases
   * after synchronous adoption or stale/fatal/throwing-command discard. */
  const commit = useCallback((result: ImportResult, label: string, operation: ImportOperation): ImportResult | null => {
    try {
      if (!operation.isCurrent()) return null
      const fatal = result.errors.find(error => error.fatal)
      if (fatal) { toast.error(`Import failed: ${label}`, { detail: fatal.message }); return null }
      const command = result.commands[0]
      if (command) optionsRef.current.dispatchCommand(command)
      if (!operation.isCurrent()) return null
      if (result.layers[0]) optionsRef.current.onSelectLayer?.(result.layers[0].id)
      if (operation.isCurrent()) reportImportResult(result, label)
      return result
    } finally { releaseImportSources(result) }
  }, [])

  /** One action scope spans all awaits, including native clipboard permission.
   * The matching operation alone may finish/update its status. */
  const run = useCallback(async <T,>(label: string, fallbackValue: T,
    work: (operation: ImportOperation, port: ImportPort, placement: { timelineId?: string; startMs: number }) => Promise<T>): Promise<T> => {
    let operation: ImportOperation | undefined
    try {
      operation = activity.begin(label, getDocumentSignal)
      const current = optionsRef.current
      return await work(operation, current.manager ?? importManager,
        { timelineId: current.selectedTimelineId ?? undefined, startMs: current.currentTimeMs ?? 0 })
    } catch (error) {
      if ((!operation || operation.isCurrent()) && (error as Error).name !== 'AbortError') {
        toast.error(`Import failed: ${label}`, { detail: (error as Error).message })
        console.error('[import] failed:', label, error)
      }
      return fallbackValue
    } finally { operation?.finish() }
  }, [activity, getDocumentSignal])

  /** Project opening has latest-request ownership independent of merge imports.
   * A replacement open cancels only the previous open; adopting a prepared scene
   * synchronously resets/aborts the old document, including ordinary imports. */
  const openScene = useCallback((file: File, onOpen: (scene: ChronoScene) => void, onError?: (error: Error) => void) => {
    latestOpen.current?.cancel()
    return run(file.name, false, async operation => {
      latestOpen.current = operation
      operation.report({ stage: 'reading', label: 'Preparing scene document…', progress: 0.05 })
      try {
        const scene = await (optionsRef.current.sceneLoader ?? editorSceneDocumentLoader).load(file, { signal: operation.signal })
        if (!operation.isCurrent()) return false
        onOpen(scene)
        return true
      } catch (error) {
        if (operation.isCurrent() && (error as Error).name !== 'AbortError') onError?.(error as Error)
        throw error
      } finally { if (latestOpen.current === operation) latestOpen.current = null }
    })
  }, [run])

  const importFile = useCallback((file: File) => run<ImportResult | null>(file.name, null, async (op, port, placement) =>
    commit(await port.importFile(file, placement, op.report, { signal: op.signal }), file.name, op)), [run, commit])

  const importFiles = useCallback((files: FileList | File[]) => run<ImportResult[]>('Files', [], async (op, port, placement) => {
    const results: ImportResult[] = []
    for (const file of Array.from(files)) {
      if (!op.isCurrent()) break
      try {
        const result = commit(await port.importFile(file, placement, op.report, { signal: op.signal }), file.name, op)
        if (result) results.push(result)
      } catch (error) {
        if (!op.isCurrent() || (error as Error).name === 'AbortError') break
        toast.error(`Import failed: ${file.name}`, { detail: (error as Error).message })
      }
    }
    return results
  }), [run, commit])

  const importUrl = useCallback((url: string) => {
    const trimmed = url.trim()
    if (!trimmed) return Promise.resolve(null)
    const label = trimmed.split('/').pop() || trimmed
    return run<ImportResult | null>(label, null, async (op, port, placement) =>
      commit(await port.importUrl(trimmed, placement, op.report, { signal: op.signal }), label, op))
  }, [run, commit])

  const importFromClipboard = useCallback(() => run<ImportResult | null>('Clipboard', null, async (op, port, placement) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.read) throw new Error('Clipboard import is not supported in this browser.')
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (!op.isCurrent()) return null
      const result = await port.importClipboardItem(item, placement, op.report, { signal: op.signal })
      if (result) return commit(result, 'clipboard', op)
    }
    if (op.isCurrent()) toast.info('No importable image found on the clipboard')
    return null
  }), [run, commit])

  const importSpriteSheet = useCallback((file: File, opts: SpriteImportOptions) =>
    run<ImportResult | null>(file.name, null, async (op, port, placement) =>
      commit(await port.importFileAs(file, 'image/spritesheet', { ...placement, ...opts }, op.report, { signal: op.signal }), file.name, op)), [run, commit])

  const preview = useCallback((file: File) => run<ImportPreflight | null>(file.name, null, async (op, port) => {
    const result = await port.preflight(file, undefined, { signal: op.signal })
    return op.isCurrent() ? result : null
  }), [run])
  const canImport = useCallback((file: File) => run('Format check', false, async (op, port) => {
    const result = await port.canImport(file, { signal: op.signal })
    return op.isCurrent() && result.supported
  }), [run])

  return { openScene, importFile, importFiles, importUrl, importFromClipboard, importSpriteSheet, preview, canImport,
    importing: status.active > 0, activeCount: status.active, settlingCount: status.settling,
    label: status.label, progress: status.progress, cancel: activity.cancel }
}

'use client'
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Layer } from '@/lib/types'
import type { ToolMode } from '@/components/TopToolbar/ToolGroup'
import { canPlaceShape } from '@/lib/editor/placement'

interface CreationState { kind: string; template: Layer; createNext: () => Layer }
interface Options {
  toolMode: ToolMode
  setToolMode: Dispatch<SetStateAction<ToolMode>>
  onSelect: (id: string) => void
  documentSignal: AbortSignal
}

/** Persistent native shape-tool selection, shared by the editor and its native
 * acceptance adapter. Holds a registry factory and one unused template outside
 * source/history. Each committed gesture selects its ID and allocates a fresh
 * template for the next gesture, preserving the exact menu kind (including
 * Rounded Rect). Selecting that kind again toggles the tool off.
 *
 * The pointer session owns preview/history and reports completion here. Cancel,
 * document abort or an explicit tool change discards only the unused template;
 * source shapes remain untouched. Factories execute outside React state updater
 * functions so Strict Mode replay cannot allocate a second ID for one update.
 */
export function useShapeCreationTool(options: Options) {
  const [state, setState] = useState<CreationState | null>(null)
  const latest = useRef({ options, state })
  latest.current = { options, state }

  /** Exit creation while preserving any explicitly selected replacement tool. */
  const close = useCallback(() => {
    setState(null)
    latest.current.options.setToolMode(previous => previous === 'shape-draw' ? 'select' : previous)
  }, [])

  /** Arm a supported registry default or toggle the already-active kind off.
   * Returns false for nonshape capabilities; callers retain their own workflow.
   * The factory must return a fresh stable ID and equivalent default geometry. */
  const choose = useCallback((kind: string, template: Layer, createNext: () => Layer): boolean => {
    if (!canPlaceShape(template)) return false
    const current = latest.current
    if (current.state?.kind === kind && current.options.toolMode === 'shape-draw') close()
    else { setState({ kind, template, createNext }); current.options.setToolMode('shape-draw') }
    return true
  }, [close])

  /** A committed ID remains in source; refresh only the next unused template.
   * Undefined means a genuine cancellation, rather than normal mouse release. */
  const complete = useCallback((id?: string) => {
    if (!id) { close(); return }
    const current = latest.current
    current.options.onSelect(id)
    if (current.state && current.options.toolMode === 'shape-draw') {
      setState({ ...current.state, template: current.state.createNext() })
    }
  }, [close])

  useEffect(() => { if (options.toolMode !== 'shape-draw') setState(null) }, [options.toolMode])
  useEffect(() => {
    options.documentSignal.addEventListener('abort', close, { once: true })
    return () => options.documentSignal.removeEventListener('abort', close)
  }, [options.documentSignal, close])

  return { kind: state?.kind ?? null, template: state?.template ?? null, choose, complete, close }
}

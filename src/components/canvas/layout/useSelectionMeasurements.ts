import { useCallback, useMemo, useState } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { LayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { ViewportLayerChange } from '@/lib/editor/viewportKeyframes'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { makeBatchCmd } from '@/lib/editor/commands-batch'
import { prepareSelectionGaps, type SelectionGapPlan } from '@/lib/editor/selectionGaps'

interface Options {
  scene: ChronoScene
  editor: EditorStateReturn
  selectedIds: ReadonlySet<string>
  primaryId: string | null
  timeMs: number
  overrides: OverrideMap
  boundsFor: LayerWorldBoundsResolver
  enabled: boolean
  buildLayerCommitCommands?: (changes: readonly ViewportLayerChange[]) => EditorCommand[]
  onAfterLayerCommit?: (prev: Layer, next: Layer) => void
}

interface EditSession {
  plan: SelectionGapPlan
  gapId: string
  source: ChronoScene
  document: AbortSignal
  timeMs: number
  scope: string
  returnFocus?: HTMLElement
}

/** Connect exact composition-pixel neighbor measurements to the ordinary
 * viewport source/key command policy. Labels do not select or deselect layers.
 * Opening an input pins its plan, document, selection and time; intervening
 * edits disable Apply instead of overwriting a manual change. Only Apply/Enter
 * changes source, in one undo step; Cancel/Escape drops local input state.
 * No preview transaction, timers, raster buffers or scene metadata are owned.
 */
export function useSelectionMeasurements(options: Options) {
  const [session, setSession] = useState<EditSession | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const scope = JSON.stringify([Array.from(options.selectedIds).sort(), options.primaryId])
  const prepared = useMemo(() => {
    if (!options.enabled || options.selectedIds.size <= 1) return { plan: null, diagnostic: '' }
    try { return { plan: prepareSelectionGaps(options.scene, options.selectedIds, options.timeMs,
      options.overrides, options.primaryId ?? undefined, { boundsFor: options.boundsFor }), diagnostic: '' } }
    catch (cause) { return { plan: null, diagnostic: cause instanceof Error ? cause.message : String(cause) } }
  }, [options.enabled, options.scene, options.selectedIds, options.timeMs, options.overrides, options.primaryId, options.boundsFor])
  const { plan, diagnostic } = prepared
  const stale = !!session && (!options.enabled || session.source !== options.scene
    || session.document.aborted || session.document !== options.editor.getDocumentSignal()
    || session.timeMs !== options.timeMs || session.scope !== scope)
  const close = useCallback(() => {
    const target = session?.returnFocus
    setSession(null); setError('')
    if (target?.isConnected) target.focus({ preventScroll: true })
  }, [session])
  const open = useCallback((gapId: string, returnFocus?: HTMLElement) => {
    const gap = plan?.gaps.find(item => item.id === gapId)
    if (!plan || !gap || options.editor.isTransactionActive()) return
    setSession({ plan, gapId, returnFocus, source: options.editor.getScene(),
      document: options.editor.getDocumentSignal(), timeMs: options.timeMs, scope })
    setValue(String(Number(gap.gap.toFixed(6)))); setError('')
  }, [plan, options.editor, options.timeMs, scope])
  const apply = useCallback(() => {
    if (!session || stale || options.editor.isTransactionActive()) return false
    try {
      if (value.trim() === '' || !Number.isFinite(Number(value))) throw new Error('Enter a finite gap in composition pixels.')
      if (session.source !== options.editor.getScene() || session.document !== options.editor.getDocumentSignal()
          || session.document.aborted) throw new Error('The scene changed. Cancel and edit the current measurement again.')
      session.plan.assertCurrent(options.editor.getScene())
      const changes = session.plan.edit(session.gapId, Number(value))
      const commands = changes.map(change => makeUpdateLayerCmd(change.prev.id, change.next, change.prev))
      commands.push(...(options.buildLayerCommitCommands?.(changes) ?? []))
      if (changes.length) options.editor.dispatchCommand(makeBatchCmd('Edit selection gap', commands))
      if (!options.buildLayerCommitCommands) changes.forEach(change => options.onAfterLayerCommit?.(change.prev, change.next))
      close(); return true
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return false }
  }, [session, stale, options.editor, options.buildLayerCommitCommands, options.onAfterLayerCommit, value, close])
  return { plan, diagnostic, session, value, setValue, open, close, apply, stale,
    error: stale ? 'The selection, scene or playhead changed. Cancel and choose a current measurement.' : error }
}

/** Runtime UI adapter contract; never serialized with a scene. */
export type SelectionMeasurements = ReturnType<typeof useSelectionMeasurements>

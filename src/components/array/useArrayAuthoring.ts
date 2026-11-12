import { useCallback, useMemo, useState } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { ChronoScene } from '@/lib/types'
import { prepareArrayForest } from '@/lib/editor/commands-array-forest'
import { defaultLinearArraySettings, defaultGridArraySettings, defaultRadialArraySettings,
  defaultPathArraySettings, type ArraySettings, type ArrayPattern } from '@/lib/array/ArrayTypes'

interface Options {
  editor: EditorStateReturn
  scene: ChronoScene
  timeMs: number
  selectedLayerIds: ReadonlySet<string>
  selectedLayerId: string | null
  onSelectLayers: (ids: readonly string[]) => void
}

interface SourceSession {
  scene: ChronoScene
  document: AbortSignal
  timeMs: number
  sourceIds: readonly string[]
  primaryId: string
  scope: string
}

/** Canonical selection signature for this temporary tool scope. Selection order
 * has no placement meaning; primary identity is compared separately. */
function selectionScope(ids: ReadonlySet<string>, primary: string | null): string {
  return JSON.stringify([Array.from(ids).sort(), primary])
}

/** Own an Array editing session, never a second editor transaction/history.
 * Open pins source, document, selection and authoring milliseconds. Settings
 * solve bounded geometry only; source IDs/clones are allocated lazily by the
 * native plan at Apply. Any intervening source/scope edit invalidates the plan.
 * Cancel drops runtime previews without scene mutation. All arrays/DOM/GPU data
 * stay outside scene JSON. The source editor owns command history/resources.
 */
export function useArrayAuthoring(options: Options) {
  const [session, setSession] = useState<SourceSession | null>(null)
  const [pattern, setPattern] = useState<ArrayPattern>('linear')
  const [settingsByPattern, setSettingsByPattern] = useState(() => ({
    linear: defaultLinearArraySettings(), grid: defaultGridArraySettings(),
    radial: defaultRadialArraySettings(), path: defaultPathArraySettings(),
  }))
  const [pivotMode, setPivotMode] = useState<'selectionCenter' | 'active'>('selectionCenter')
  const [applyError, setApplyError] = useState('')
  const settings = settingsByPattern[pattern]
  const currentScope = selectionScope(options.selectedLayerIds, options.selectedLayerId)
  const close = useCallback(() => { setSession(null); setApplyError('') }, [])
  const open = useCallback(() => {
    if (!options.selectedLayerId || options.editor.isTransactionActive()) return false
    const source = options.editor.getScene()
    const sourceIds = options.selectedLayerIds.size ? Array.from(options.selectedLayerIds) : [options.selectedLayerId]
    setSettingsByPattern({ linear: defaultLinearArraySettings(), grid: defaultGridArraySettings(),
      radial: defaultRadialArraySettings(), path: defaultPathArraySettings(source.layers.find(layer => layer.type === 'path' && (layer.path?.anchors.length ?? 0) >= 2)?.id) })
    setPattern('linear'); setPivotMode('selectionCenter'); setApplyError('')
    setSession({ scene: source, document: options.editor.getDocumentSignal(), timeMs: options.timeMs,
      sourceIds, primaryId: options.selectedLayerId, scope: currentScope })
    return true
  }, [options.editor, options.selectedLayerId, options.selectedLayerIds, options.timeMs, currentScope])
  const stale = !!session && (session.scene !== options.scene || session.document.aborted
    || session.document !== options.editor.getDocumentSignal() || session.timeMs !== options.timeMs
    || session.scope !== currentScope)
  const prepared = useMemo(() => {
    if (!session) return { plan: null, error: '' }
    if (stale) return { plan: null, error: 'The source, selection, time or document changed. Cancel and open Array again against the current scene.' }
    try {
      return { plan: prepareArrayForest(session.scene, { sourceIds: session.sourceIds,
        primaryId: session.primaryId, timeMs: session.timeMs, settings, pivotMode }), error: '' }
    } catch (error) { return { plan: null, error: error instanceof Error ? error.message : String(error) } }
  }, [session, stale, settings, pivotMode])
  const setSettings = useCallback((next: ArraySettings) => {
    setApplyError(''); setSettingsByPattern(previous => ({ ...previous, [next.pattern]: next }))
  }, [])
  const apply = useCallback(() => {
    if (!session || !prepared.plan || stale || options.editor.isTransactionActive()) return false
    try {
      if (session.scene !== options.editor.getScene() || session.document !== options.editor.getDocumentSignal()
          || session.document.aborted) throw new Error('The Array source changed. Cancel and reopen Array.')
      prepared.plan.assertCurrent(options.editor.getScene())
      const command = prepared.plan.buildCommand()
      options.editor.dispatchCommand(command)
      options.onSelectLayers(command.result.suggestedSelection)
      close()
      return true
    } catch (error) { setApplyError(error instanceof Error ? error.message : String(error)); return false }
  }, [session, prepared.plan, stale, options.editor, options.onSelectLayers, close])
  return { active: !!session, open, close, settings, setSettings, pattern, setPattern,
    pivotMode, setPivotMode, plan: prepared.plan, error: applyError || prepared.error, stale, apply,
    sourceName: session?.scene.layers.find(layer => layer.id === session.primaryId)?.name ?? '',
    sourceCount: session?.sourceIds.length ?? 0,
    pathLayers: options.scene.layers.filter(layer => layer.type === 'path' && (layer.path?.anchors.length ?? 0) >= 2) }
}

/** Public React adapter type shared by floating controls and the canvas overlay. */
export type ArrayAuthoringController = ReturnType<typeof useArrayAuthoring>

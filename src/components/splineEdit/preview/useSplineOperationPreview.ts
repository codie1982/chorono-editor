'use client'
import { useEffect, useMemo, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { SplineEditMode } from '@/lib/spline/selection'
import type { SplineEditController } from '../useSplineEditSelection'

export interface SplinePreviewContext {
  scene: ChronoScene; controller: SplineEditController; timeMs: number; overrides?: OverrideMap; documentSignal: AbortSignal; disabled: boolean
  getScene(): ChronoScene; dispatch(command: EditorCommand): void; isTransactionActive(): boolean
}
interface Session { scene: ChronoScene; layerId: string; mode: string; ids: string; timeMs: number; documentSignal: AbortSignal }
interface Plan<I, R> { request: I; command(result: R): { ids: string[]; command: EditorCommand } }
interface Options<S, I, R> extends SplinePreviewContext {
  settings: S; eligible: boolean; focusMode: SplineEditMode
  prepare(): Plan<I, R>; execute(request: I, signal: AbortSignal): Promise<R>
}

/** Shared page-owned preview transaction for Offset and Chamfer. Captures exact
 * source/time/selection/document; invalidation immediately hides results, aborts
 * CPU work and rejects late promises. Settings replace a job, never the scene.
 * Apply dispatches one guarded native command; Cancel has no history/source
 * effect. Results/settings are UI-only, not saved/exported. Re-selection waits
 * until the new source owns its IDs. No worker/cache survives exit or unmount. */
export function useSplineOperationPreview<S, I, R>(options: Options<S, I, R>) {
  const { scene, controller, timeMs, overrides, documentSignal, disabled, settings } = options
  const idsKey = JSON.stringify(controller.ids), layerId = controller.layerId
  const [session, setSession] = useState<Session | null>(null), [applyError, setApplyError] = useState('')
  const [pendingIds, setPendingIds] = useState<{ layerId: string; ids: string[] } | null>(null)
  useEffect(() => {
    if (!pendingIds) return
    const data = scene.layers.find(layer => layer.id === pendingIds.layerId)?.spline
    const records = data && (options.focusMode === 'point' ? data.points : data.subShapes)
    if (layerId === pendingIds.layerId && records && pendingIds.ids.every(id => records[id])) controller.enter(options.focusMode, pendingIds.ids)
    setPendingIds(null)
  }, [pendingIds, scene, layerId, controller.enter, options.focusMode])
  const active = !!session && session.scene === scene && session.layerId === layerId && session.mode === controller.mode && session.ids === idsKey
    && session.timeMs === timeMs && session.documentSignal === documentSignal && !documentSignal.aborted && !disabled && controller.active
  const prepared = useMemo(() => {
    if (!active || !layerId) return null
    try { return { plan: options.prepare() } }
    catch (error) { return { reason: error instanceof Error ? error.message : String(error) } }
    // prepare is a render closure; the captured semantic inputs below own it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, scene, layerId, controller.mode, idsKey, settings, timeMs, overrides])
  const owner = useMemo(() => ({ session, prepared }), [session, prepared])
  const [job, setJob] = useState<{ owner: typeof owner; result?: R; error?: string } | null>(null)
  useEffect(() => { if (!active) { setSession(null); setJob(null) } }, [active])
  useEffect(() => {
    if (!active || !prepared?.plan) return
    const abort = new AbortController(), cancel = () => abort.abort()
    documentSignal.addEventListener('abort', cancel, { once: true })
    let live = true
    void options.execute(prepared.plan.request, abort.signal).then(result => {
      if (live && !abort.signal.aborted) setJob({ owner, result })
    }, error => { if (live && !abort.signal.aborted) setJob({ owner, error: error instanceof Error ? error.message : String(error) }) })
    return () => { live = false; abort.abort(); documentSignal.removeEventListener('abort', cancel) }
    // execute is adapter-bound by the caller; a changed adapter restarts the job.
  }, [active, prepared, owner, documentSignal, options.execute])
  const current = active && job?.owner === owner ? job : null
  /** Capture the current context; no evaluated coordinates are written. */
  const open = () => {
    if (disabled || !layerId || !options.eligible) return
    setApplyError(''); setSession({ scene, layerId, mode: controller.mode, ids: idsKey, timeMs, documentSignal })
  }
  const close = () => { setSession(null); setJob(null); setApplyError('') }
  /** Late results never authorize writes against changed source or transactions. */
  const apply = () => {
    try {
      if (!active || !prepared?.plan || !current?.result || options.getScene() !== scene || options.isTransactionActive()) throw new Error('Preview the current paused spline again before Apply.')
      const result = prepared.plan.command(current.result)
      options.dispatch(result.command); setPendingIds({ layerId: layerId!, ids: result.ids }); close()
    } catch (error) { setApplyError(error instanceof Error ? error.message : String(error)) }
  }
  return { active, disabled, open, close, apply, result: current?.result, error: applyError || prepared?.reason || current?.error,
    pending: active && !!prepared?.plan && !current, canApply: active && !!prepared?.plan && !!current?.result && !disabled }
}

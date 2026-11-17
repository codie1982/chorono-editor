'use client'
import { useEffect, useMemo, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { BooleanWorkerClient, type BooleanExecutor, type BooleanOperation, type BooleanResult } from '@/lib/geometry/boolean'
import { booleanTargets, prepareBooleanOperands } from '@/lib/editor/boolean/prepareBooleanOperands'
import { booleanOwner, prepareBooleanOperation } from '@/lib/editor/boolean/operationPlan'
import type { SplineEditController } from '../splineEdit/useSplineEditSelection'

const worker = new BooleanWorkerClient()
export interface BooleanPreviewOptions {
  scene: ChronoScene; selectedIds: ReadonlySet<string>; primary: string | null
  splineEdit: SplineEditController; timeMs: number; overrides: OverrideMap
  documentSignal: AbortSignal; disabled: boolean; executor?: BooleanExecutor
  dispatch?: (command: EditorCommand) => void; getScene?: () => ChronoScene
  onApplied?: (ownerId: string) => void; isTransactionActive?: () => boolean
}
interface Session { scene: ChronoScene; selectionKey: string; objectKey: string; primary: string | null; timeMs: number; documentSignal: AbortSignal; editId?: string }
/** Page-owned transient draft shared by dock and viewport. Any source, time,
 * selection/document/context change hides output and aborts the worker. A late
 * reply never grants Apply permission. Compatible inputs preview in the exact
 * persisted sampling space; unsupported animated inputs retain area-only preview
 * with an explicit Apply diagnostic. Cancel writes no source/history. Apply
 * dispatches one snapshot-guarded native command and keeps original IDs/keys. */
export function useBooleanPreview(options: BooleanPreviewOptions) {
  const { scene, primary, splineEdit, timeMs, overrides, documentSignal, disabled, executor = worker } = options
  const selectionKey = JSON.stringify(Array.from(options.selectedIds))
  const objectKey = splineEdit.active && splineEdit.mode === 'object' ? JSON.stringify(splineEdit.ids) : ''
  const selectedOperation = booleanOwner(scene, primary)
  const [session, setSession] = useState<Session | null>(null)
  const active = !!session && session.scene === scene && session.selectionKey === selectionKey && session.objectKey === objectKey
    && session.primary === primary && session.timeMs === timeMs && session.documentSignal === documentSignal && !disabled && !documentSignal.aborted
  const editOwner = active && session?.editId ? booleanOwner(scene, session.editId) : selectedOperation
  const targets = useMemo(() => editOwner?.booleanOperation ? editOwner.booleanOperation.inputs.map(input => ({ ...input,
    label: (input.subShapeId ? scene.layers.find(layer => layer.id === input.layerId)?.spline?.subShapes[input.subShapeId]?.name : undefined) ?? scene.layers.find(layer => layer.id === input.layerId)?.name ?? input.layerId }))
    : booleanTargets(scene, new Set(JSON.parse(selectionKey) as string[]), primary,
      objectKey && splineEdit.layerId ? { layerId: splineEdit.layerId, ids: JSON.parse(objectKey) as string[] } : undefined),
  [scene, selectionKey, primary, objectKey, splineEdit.layerId, editOwner])
  const [operation, setOperation] = useState<BooleanOperation>('union'), [reverse, setReverse] = useState(false), [tolerancePx, setTolerance] = useState(.25)
  const preparation = useMemo(() => {
    if (!active) return null
    try { return { plan: prepareBooleanOperation(scene, targets, { operation, reverse, tolerancePx }, timeMs, overrides, session?.editId) } }
    catch (error) { return { reason: error instanceof Error ? error.message : String(error) } }
  }, [active, scene, targets, operation, reverse, tolerancePx, timeMs, overrides, session])
  const jobOwner = useMemo(() => ({ session, preparation, operation, reverse, tolerancePx, overrides, targets }), [session, preparation, operation, reverse, tolerancePx, overrides, targets])
  const [job, setJob] = useState<{ owner: typeof jobOwner; raw?: BooleanResult; result?: BooleanResult; error?: string } | null>(null)
  useEffect(() => { if (!active) { setSession(null); setJob(null) } }, [active])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController(), abort = () => controller.abort()
    documentSignal.addEventListener('abort', abort, { once: true })
    let live = true; setJob(null)
    try {
      const request = preparation?.plan?.request ?? { operation, reverse, tolerancePx, operands: prepareBooleanOperands(scene, targets, timeMs, overrides) }
      void executor.execute(request, controller.signal).then(raw => {
        if (live && !controller.signal.aborted) setJob({ owner: jobOwner, raw, result: preparation?.plan?.preview(raw) ?? raw })
      }, error => { if (live && !controller.signal.aborted) setJob({ owner: jobOwner, error: error instanceof Error ? error.message : String(error) }) })
    } catch (error) { setJob({ owner: jobOwner, error: error instanceof Error ? error.message : String(error) }) }
    return () => { live = false; controller.abort(); documentSignal.removeEventListener('abort', abort) }
  }, [active, jobOwner, scene, targets, timeMs, overrides, documentSignal, operation, reverse, tolerancePx, executor, preparation])
  const current = active && job?.owner === jobOwner ? job : null
  /** Begin one UI draft from current source; does not select or mutate a layer. */
  const openOperation = (id?: string) => {
    setApplyError(undefined)
    const owner = id ? booleanOwner(scene, id) : selectedOperation
    if (id && !owner) { setApplyError('The Boolean operation no longer exists. Select the current operation first.'); return }
    const recipe = owner?.booleanOperation
    setOperation(recipe?.operation ?? 'union'); setReverse(recipe?.reverse ?? false); setTolerance(recipe?.tolerancePx ?? .25)
    setSession({ scene, selectionKey, objectKey, primary, timeMs, documentSignal, editId: owner?.id })
  }
  const [applyError, setApplyError] = useState<string | undefined>()
  const close = () => { setSession(null); setJob(null); setApplyError(undefined) }
  /** Refuse stale sources/active gestures before the single native commit. */
  const apply = () => {
    try {
      if (!active || !preparation?.plan || !current?.raw || !options.dispatch || options.getScene?.() !== scene || options.isTransactionActive?.()) throw new Error('Preview again on the current paused scene before Apply.')
      options.dispatch(preparation.plan.command(current.raw)); options.onApplied?.(preparation.plan.ownerId); close()
    } catch (error) { setApplyError(error instanceof Error ? error.message : String(error)) }
  }
  return { targets, operation, reverse, tolerancePx, active, disabled, result: current?.result, error: current?.error ?? applyError,
    pending: active && !current, setOperation, setReverse, setTolerance, open: () => openOperation(), openOperation, close, apply,
    canApply: !!(active && preparation?.plan && current?.raw && options.dispatch && !disabled), applyReason: preparation?.reason,
    selectedOperationId: selectedOperation?.id }
}
export type BooleanPreviewController = ReturnType<typeof useBooleanPreview>

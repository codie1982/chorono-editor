'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Layer } from '@/lib/types'
import { emptySplineSelection, pruneSplineSelection, selectSplineIds, type SplineEditMode, type SplinePickMode, type SplineSelection } from '@/lib/spline/selection'
import { modifierOutputReadOnly } from '@/lib/modifiers/ModifierStackService'
import type { SplineSourceGhost } from '@/lib/editor/boolean/materializeSplineBoolean'
import type { BooleanOperation } from '@/lib/geometry/boolean'

export type SplineAddOperation = 'attach' | BooleanOperation
export type SplineEdgePickTool = 'trim' | 'extend'

export interface SplineEditController {
  readonly sourceGhosts: readonly SplineSourceGhost[]
  focusResult(request: SplineEditRequest): void
  readonly layerId: string | null
  readonly active: boolean
  readonly mode: SplineEditMode
  readonly bank: SplineSelection
  readonly ids: readonly string[]
  /** One-shot Edge tool intent; only an explicit viewport pick changes source. */
  readonly edgeTool: SplineEdgePickTool | null
  setEdgeTool(value: SplineEdgePickTool | null): void
  /** Pick existing scene splines into this layer; never a drawing tool. */
  readonly attaching: boolean
  setAttaching(value: boolean): void
  readonly nonDestructive: boolean
  setNonDestructive(value: boolean): void
  readonly attachOperation: SplineAddOperation
  setAttachOperation(value: SplineAddOperation): void
  enter(mode: SplineEditMode, ids?: readonly string[]): void
  select(ids: readonly string[], policy?: SplinePickMode): void
  clear(): void
  exit(): void
}
/** UI focus request after a host changes its primary layer. Drawing results
 * supply IDs; a mode-only request preserves the selected mode's valid ID bank. */
export interface SplineEditRequest { layerId: string; mode: SplineEditMode; ids?: readonly string[]; ghosts?: readonly SplineSourceGhost[]; attaching?: boolean; operation?: SplineAddOperation }
interface State { layerId: string | null; document?: AbortSignal; active: boolean; mode: SplineEditMode; bank: SplineSelection; attaching: boolean; attachOperation: SplineAddOperation; ghosts: readonly SplineSourceGhost[]; nonDestructive: boolean; edgeTool: SplineEdgePickTool | null; pickSource?: Layer['spline'] }
/** Transient layer/document-scoped selection owner, shared by Properties and
 * viewport. Switching modes keeps each valid ID bank but never changes source,
 * history or clipboard. Reset/deletion prunes synchronously for consumers and
 * commits cleanup after render so Undo cannot revive stale selections. Add
 * picking is transient Object-mode state: same-mode result focus preserves it,
 * while exit, another mode, layer or document releases it. */
export function useSplineEditSelection(layer: Layer | null | undefined, document?: AbortSignal): SplineEditController {
  const layerId = layer?.type === 'spline' && layer.spline && !layer.booleanResultFor && !modifierOutputReadOnly(layer) ? layer.id : null
  const fresh = useCallback((): State => ({ layerId, document, active: false, mode: 'point', bank: emptySplineSelection(), attaching: false, attachOperation: 'union', ghosts: [], nonDestructive: false, edgeTool: null }), [layerId, document])
  const [state, setState] = useState<State>(fresh)
  const [pending, setPending] = useState<{ request: SplineEditRequest; document?: AbortSignal } | null>(null)
  useEffect(() => {
    if (!pending) return
    if (pending.document !== document) { setPending(null); return }
    const request = pending.request
    if (request.layerId !== layerId) return
    setState({ layerId, document, active: true, mode: request.mode,
      bank: selectSplineIds(emptySplineSelection(), request.mode, request.ids ?? [], 'replace'),
      attaching: request.attaching ?? false, attachOperation: request.operation ?? 'union', ghosts: request.ghosts ?? [], nonDestructive: false, edgeTool: null })
    setPending(null)
  }, [pending, layerId, document])
  const clean = useCallback((before: State): State => {
    if (before.layerId !== layerId || before.document !== document) return fresh()
    const bank = pruneSplineSelection(before.bank, layer?.spline)
    const stalePick = before.edgeTool && before.pickSource !== layer?.spline
    return bank === before.bank && !stalePick ? before : { ...before, bank, ...(stalePick ? { edgeTool: null, pickSource: undefined } : {}) }
  }, [layerId, document, layer?.spline, fresh])
  const current = clean(state)
  useEffect(() => { setState(clean) }, [clean])
  const enter = useCallback((mode: SplineEditMode, ids?: readonly string[]) => setState(before => {
    const next = clean(before)
    return { ...next, active: !!layerId, mode, attaching: next.attaching && mode === 'object', edgeTool: null,
      bank: ids ? pruneSplineSelection(selectSplineIds(next.bank, mode, ids, 'replace'), layer?.spline) : next.bank }
  }), [clean, layerId, layer?.spline])
  const select = useCallback((ids: readonly string[], policy: SplinePickMode = 'replace') => setState(before => {
    const next = clean(before)
    return { ...next, edgeTool: null, bank: pruneSplineSelection(selectSplineIds(next.bank, next.mode, ids, policy), layer?.spline) }
  }), [clean, layer?.spline])
  const clear = useCallback(() => select([]), [select])
  const setAttaching = useCallback((value: boolean) => setState(before => {
    const next = clean(before)
    return { ...next, edgeTool: null, attaching: value && next.active && !!layerId, mode: value ? 'object' : next.mode }
  }), [clean, layerId])
  const exit = useCallback(() => setState(fresh()), [fresh])
  const setAttachOperation = useCallback((value: SplineAddOperation) => setState(before => ({ ...clean(before), attachOperation: value })), [clean])
  const setEdgeTool = useCallback((value: SplineEdgePickTool | null) => setState(before => {
    const next = clean(before)
    return { ...next, edgeTool: next.active && next.mode === 'edge' ? value : null, pickSource: value ? layer?.spline : undefined, attaching: false }
  }), [clean, layer?.spline])
  return { sourceGhosts: current.ghosts, focusResult: request => setPending({ request, document }), layerId, active: current.active && !!layerId, mode: current.mode, bank: current.bank,
    ids: current.bank[current.mode], edgeTool: current.edgeTool, setEdgeTool, attaching: current.attaching, setAttaching,
    nonDestructive: current.nonDestructive, setNonDestructive: value => setState(before => ({ ...clean(before), nonDestructive: value })),
    attachOperation: current.attachOperation, setAttachOperation, enter, select, clear, exit }
}

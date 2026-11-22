'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Layer } from '@/lib/types'
import { emptySplineSelection, pruneSplineSelection, selectSplineIds, type SplineEditMode, type SplinePickMode, type SplineSelection } from '@/lib/spline/selection'
import { modifierOutputReadOnly } from '@/lib/modifiers/ModifierStackService'

export interface SplineEditController {
  readonly layerId: string | null
  readonly active: boolean
  readonly mode: SplineEditMode
  readonly bank: SplineSelection
  readonly ids: readonly string[]
  /** Pick existing scene splines into this layer; never a drawing tool. */
  readonly attaching: boolean
  setAttaching(value: boolean): void
  enter(mode: SplineEditMode, ids?: readonly string[]): void
  select(ids: readonly string[], policy?: SplinePickMode): void
  clear(): void
  exit(): void
}
/** UI focus request after a host changes its primary layer. Drawing results
 * supply IDs; a mode-only request preserves the selected mode's valid ID bank. */
export interface SplineEditRequest { layerId: string; mode: SplineEditMode; ids?: readonly string[] }
interface State { layerId: string | null; document?: AbortSignal; active: boolean; mode: SplineEditMode; bank: SplineSelection; attaching: boolean }
/** Transient layer/document-scoped selection owner, shared by Properties and
 * viewport. Switching modes keeps each valid ID bank but never changes source,
 * history or clipboard. Reset/deletion prunes synchronously for consumers and
 * commits cleanup after render so Undo cannot revive stale selections. Add
 * picking is transient Object-mode state: same-mode result focus preserves it,
 * while exit, another mode, layer or document releases it. */
export function useSplineEditSelection(layer: Layer | null | undefined, document?: AbortSignal): SplineEditController {
  const layerId = layer?.type === 'spline' && layer.spline && !layer.booleanResultFor && !modifierOutputReadOnly(layer) ? layer.id : null
  const fresh = useCallback((): State => ({ layerId, document, active: false, mode: 'point', bank: emptySplineSelection(), attaching: false }), [layerId, document])
  const [state, setState] = useState<State>(fresh)
  const clean = useCallback((before: State): State => {
    if (before.layerId !== layerId || before.document !== document) return fresh()
    const bank = pruneSplineSelection(before.bank, layer?.spline)
    return bank === before.bank ? before : { ...before, bank }
  }, [layerId, document, layer?.spline, fresh])
  const current = clean(state)
  useEffect(() => { setState(clean) }, [clean])
  const enter = useCallback((mode: SplineEditMode, ids?: readonly string[]) => setState(before => {
    const next = clean(before)
    return { ...next, active: !!layerId, mode, attaching: next.attaching && mode === 'object',
      bank: ids ? pruneSplineSelection(selectSplineIds(next.bank, mode, ids, 'replace'), layer?.spline) : next.bank }
  }), [clean, layerId, layer?.spline])
  const select = useCallback((ids: readonly string[], policy: SplinePickMode = 'replace') => setState(before => {
    const next = clean(before)
    return { ...next, bank: pruneSplineSelection(selectSplineIds(next.bank, next.mode, ids, policy), layer?.spline) }
  }), [clean, layer?.spline])
  const clear = useCallback(() => select([]), [select])
  const setAttaching = useCallback((value: boolean) => setState(before => {
    const next = clean(before)
    return { ...next, attaching: value && next.active && !!layerId, mode: value ? 'object' : next.mode }
  }), [clean, layerId])
  const exit = useCallback(() => setState(fresh()), [fresh])
  return { layerId, active: current.active && !!layerId, mode: current.mode, bank: current.bank,
    ids: current.bank[current.mode], attaching: current.attaching, setAttaching, enter, select, clear, exit }
}

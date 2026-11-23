'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Layer } from '@/lib/types'
import { emptySplineSelection, pruneSplineSelection, selectSplineIds, type SplineEditMode, type SplinePickMode, type SplineSelection } from '@/lib/spline/selection'
import { modifierOutputReadOnly } from '@/lib/modifiers/ModifierStackService'
import type { SplineSourceGhost } from '@/lib/editor/boolean/materializeSplineBoolean'
import type { BooleanOperation } from '@/lib/geometry/boolean'
import type { SplineVertexType } from '@/lib/spline/edit/addVertex'

export type SplineAddOperation = 'attach' | BooleanOperation
export type SplineEdgePickTool = 'trim' | 'extend' | 'addVertex'

export interface SplineEditController {
  /** Per-layer/document viewport preference, never source paint or Undo. */
  readonly sourceGuideVisible?: boolean
  setSourceGuideVisible?(value: boolean): void
  readonly sourceGhosts: readonly SplineSourceGhost[]
  focusResult(request: SplineEditRequest): void
  readonly layerId: string | null
  readonly active: boolean
  readonly mode: SplineEditMode
  readonly bank: SplineSelection
  readonly ids: readonly string[]
  /** Trim/Extend are one-shot; Add Vertex persists until explicit cancellation. */
  readonly edgeTool: SplineEdgePickTool | null
  setEdgeTool(value: SplineEdgePickTool | null): void
  readonly vertexType: SplineVertexType
  setVertexType(value: SplineVertexType): void
  readonly simplifyTolerancePx: number
  setSimplifyTolerancePx(value: number): void
  readonly subdivideParts: number
  setSubdivideParts(value: number): void
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
export interface SplineEditRequest { layerId: string; mode: SplineEditMode; ids?: readonly string[]; ghosts?: readonly SplineSourceGhost[]; attaching?: boolean; operation?: SplineAddOperation; edgeTool?: 'addVertex'; vertexType?: SplineVertexType; pointId?: string; simplifyTolerancePx?: number; subdivideParts?: number }
interface State { layerId: string | null; document?: AbortSignal; active: boolean; mode: SplineEditMode; bank: SplineSelection; attaching: boolean; attachOperation: SplineAddOperation; ghosts: readonly SplineSourceGhost[]; nonDestructive: boolean; edgeTool: SplineEdgePickTool | null; pickSource?: Layer['spline']; vertexType: SplineVertexType; simplifyTolerancePx: number; subdivideParts: number }
/** Transient layer/document-scoped selection owner, shared by Properties and
 * viewport. Switching modes keeps each valid ID bank but never changes source,
 * history or clipboard. Reset/deletion prunes synchronously for consumers and
 * commits cleanup after render so Undo cannot revive stale selections. Attach
 * picking belongs to Object mode. Continuous Add Vertex, its connection type
 * and local Simplify tolerance are transient preferences; result focus carries
 * them through source commits without adding history. Exit/layer/document
 * replacement releases preferences; mode/selection changes cancel picking. */
export function useSplineEditSelection(layer: Layer | null | undefined, document?: AbortSignal): SplineEditController {
  const layerId = layer?.type === 'spline' && layer.spline && !layer.booleanResultFor && !modifierOutputReadOnly(layer) ? layer.id : null
  const [sourceGuideVisible, setSourceGuideVisible] = useState(true)
  useEffect(() => { setSourceGuideVisible(true) }, [layerId, document])
  const fresh = useCallback((): State => ({ layerId, document, active: false, mode: 'point', bank: emptySplineSelection(), attaching: false, attachOperation: 'union', ghosts: [], nonDestructive: false, edgeTool: null, vertexType: 'preserve', simplifyTolerancePx: .5, subdivideParts: 2 }), [layerId, document])
  const [state, setState] = useState<State>(fresh)
  const [pending, setPending] = useState<{ request: SplineEditRequest; document?: AbortSignal } | null>(null)
  useEffect(() => {
    if (!pending) return
    if (pending.document !== document) { setPending(null); return }
    const request = pending.request
    if (request.layerId !== layerId) return
    let bank = selectSplineIds(emptySplineSelection(), request.mode, request.ids ?? [], 'replace')
    if (request.pointId) bank = selectSplineIds(bank, 'point', [request.pointId], 'replace')
    setState({ layerId, document, active: true, mode: request.mode, bank,
      attaching: request.attaching ?? false, attachOperation: request.operation ?? 'union', ghosts: request.ghosts ?? [], nonDestructive: false,
      edgeTool: request.mode === 'edge' && request.edgeTool === 'addVertex' ? 'addVertex' : null, vertexType: request.vertexType ?? 'preserve', simplifyTolerancePx: request.simplifyTolerancePx ?? .5, subdivideParts: request.subdivideParts ?? 2 })
    setPending(null)
  }, [pending, layerId, document])
  const clean = useCallback((before: State): State => {
    if (before.layerId !== layerId || before.document !== document) return fresh()
    const bank = pruneSplineSelection(before.bank, layer?.spline)
    // Insertion has no cached preview. Each click reads current source, so it
    // remains active across its own commits and Undo/Redo without an idle frame.
    const stalePick = before.edgeTool && before.edgeTool !== 'addVertex' && before.pickSource !== layer?.spline
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
  const setVertexType = useCallback((value: SplineVertexType) => {
    if (!['preserve', 'corner', 'smooth', 'bezier', 'bezierCorner'].includes(value)) return
    setState(before => ({ ...clean(before), vertexType: value }))
  }, [clean])
  const setSimplifyTolerancePx = useCallback((value: number) => {
    if (Number.isFinite(value) && value >= .001 && value <= 1000) setState(before => ({ ...clean(before), simplifyTolerancePx: value }))
  }, [clean])
  const setSubdivideParts = useCallback((value: number) => {
    if (Number.isInteger(value) && value >= 2 && value <= 64) setState(before => ({ ...clean(before), subdivideParts: value }))
  }, [clean])
  return { sourceGuideVisible, setSourceGuideVisible, sourceGhosts: current.ghosts, focusResult: request => setPending({ request, document }), layerId, active: current.active && !!layerId, mode: current.mode, bank: current.bank,
    ids: current.bank[current.mode], edgeTool: current.edgeTool, setEdgeTool, vertexType: current.vertexType, setVertexType, simplifyTolerancePx: current.simplifyTolerancePx, setSimplifyTolerancePx, subdivideParts: current.subdivideParts, setSubdivideParts, attaching: current.attaching, setAttaching,
    nonDestructive: current.nonDestructive, setNonDestructive: value => setState(before => ({ ...clean(before), nonDestructive: value })),
    attachOperation: current.attachOperation, setAttachOperation, enter, select, clear, exit }
}

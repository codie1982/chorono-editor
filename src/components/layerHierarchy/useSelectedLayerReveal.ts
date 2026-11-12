'use client'
import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import type { Layer } from '@/lib/types'
import { LayerIndex } from '@/lib/scene/LayerIndex'

/** Reveals the primary selection in either virtualized layer tree. A new
 * selection snapshot (including reselecting the same object) opens only its
 * ancestors, then waits for the resulting row layout before scrolling. Row
 * virtualization owns the scroll operation; focus and scene data never change.
 * Missing/filtered rows remain pending until available. Manual scrolling or
 * collapsing after a successful reveal stays free until the next selection.
 */
export function useSelectedLayerReveal({ layers, selectedId, selectedIds, setCollapsedIds, rowKeys, reveal, viewportHeight, requestKey = 0 }: {
  layers: readonly Layer[]
  selectedId: string | null
  selectedIds: ReadonlySet<string>
  setCollapsedIds: Dispatch<SetStateAction<Set<string>>>
  rowKeys: readonly string[]
  reveal: (index: number) => boolean
  viewportHeight: number
  requestKey?: string | number
}) {
  const index = useMemo(() => new LayerIndex(layers), [layers])
  const ancestors = useMemo(() => index.ancestorIds(selectedIds.size ? selectedIds : selectedId ? [selectedId] : [], false), [index, selectedId, selectedIds])
  const path = JSON.stringify(Array.from(ancestors))
  const request = useRef<{ id: string | null; ids: ReadonlySet<string>; path: string; key: string | number } | null>(null)
  const revealed = useRef(false)

  useEffect(() => {
    if (request.current?.id === selectedId && request.current.ids === selectedIds && request.current.path === path && request.current.key === requestKey) return
    request.current = { id: selectedId, ids: selectedIds, path, key: requestKey }
    revealed.current = false
    if (!selectedId) return
    setCollapsedIds(previous => {
      if (!Array.from(ancestors).some(id => previous.has(id))) return previous
      const next = new Set(previous)
      ancestors.forEach(id => next.delete(id))
      return next
    })
  }, [index, selectedId, selectedIds, setCollapsedIds, path, requestKey, ancestors])

  useEffect(() => {
    if (!selectedId || revealed.current || viewportHeight <= 0) return
    const row = rowKeys.indexOf(selectedId)
    if (row >= 0 && reveal(row)) revealed.current = true
  }, [selectedId, selectedIds, rowKeys, reveal, viewportHeight, requestKey, path])
}

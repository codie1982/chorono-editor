'use client'
import { useCallback, useEffect, useState } from 'react'

/** Explicit, reversible UI-only filter exception. A Find request never changes
 * search/solo/source membership, and a new selection restores the original
 * filter view. The nonce distinguishes repeated clicks on the same object.
 */
export function useFindSelected(selectedId: string | null, selectedIds: ReadonlySet<string>) {
  const [revealIds, setRevealIds] = useState<readonly string[]>([])
  const [nonce, setNonce] = useState(0)
  useEffect(() => { setRevealIds([]) }, [selectedId, selectedIds])
  const find = useCallback((targetIds?: readonly string[]) => {
    setRevealIds(Array.from(targetIds ?? (selectedIds.size ? selectedIds : selectedId ? [selectedId] : [])))
    setNonce(value => value + 1)
  }, [selectedId, selectedIds])
  const restore = useCallback(() => setRevealIds([]), [])
  return { revealIds, nonce, find, restore }
}

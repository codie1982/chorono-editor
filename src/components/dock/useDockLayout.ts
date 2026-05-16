'use client'
import { useState, useCallback, useEffect } from 'react'
import type { DockNode, DockEdge } from './types'
import {
  defaultLayout, dropPanel, setActiveTab, setSplitRatio,
} from './layoutOps'

const LS_KEY = 'chorono.dockLayout.v1'

interface DockLayoutReturn {
  layout: DockNode
  dispatchDrop:      (panelId: string, targetLeafId: string, edge: DockEdge) => void
  dispatchTab:       (leafId: string, panelId: string) => void
  dispatchResize:    (splitId: string, ratio: number) => void
  resetLayout:       () => void
}

/**
 * Owns the dock tree + persists it to localStorage. Provides imperative
 * mutators for drag-drop, tab switching, and splitter resize.
 *
 * NOTE: the saved layout is replaced by `defaultLayout()` if shape can't be
 * parsed back — protects against version skew when the schema evolves.
 */
export function useDockLayout(): DockLayoutReturn {
  const [layout, setLayout] = useState<DockNode>(() => {
    if (typeof window === 'undefined') return defaultLayout()
    try {
      const raw = window.localStorage.getItem(LS_KEY)
      if (!raw) return defaultLayout()
      const parsed = JSON.parse(raw) as DockNode
      // Cheap sanity check — must have a kind field
      if (parsed && typeof parsed === 'object' && 'kind' in parsed) return parsed
    } catch { /* fall through */ }
    return defaultLayout()
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LS_KEY, JSON.stringify(layout))
  }, [layout])

  const dispatchDrop = useCallback((panelId: string, targetLeafId: string, edge: DockEdge) => {
    setLayout((tree) => dropPanel(tree, panelId, targetLeafId, edge))
  }, [])

  const dispatchTab = useCallback((leafId: string, panelId: string) => {
    setLayout((tree) => setActiveTab(tree, leafId, panelId))
  }, [])

  const dispatchResize = useCallback((splitId: string, ratio: number) => {
    setLayout((tree) => setSplitRatio(tree, splitId, ratio))
  }, [])

  const resetLayout = useCallback(() => setLayout(defaultLayout()), [])

  return { layout, dispatchDrop, dispatchTab, dispatchResize, resetLayout }
}

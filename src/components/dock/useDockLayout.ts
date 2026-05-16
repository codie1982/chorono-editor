'use client'
import { useState, useCallback, useEffect } from 'react'
import type { DockNode, DockEdge } from './types'
import {
  defaultLayout, dropPanel, dropPanelToRoot,
  setActiveTab, setSplitRatio, isValidLayout,
} from './layoutOps'
import { ROOT_LEAF_ID } from './DockOuterEdges'

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
 * `expectedPanelIds` is the set of panels the registry exposes — used to
 * validate the persisted tree. If a saved tree is missing one or carries
 * a duplicate (e.g. left over from an older bug) we fall back to the
 * default layout silently instead of crashing or rendering a broken UI.
 */
export function useDockLayout(expectedPanelIds: string[] = []): DockLayoutReturn {
  const [layout, setLayout] = useState<DockNode>(() => {
    if (typeof window === 'undefined') return defaultLayout()
    try {
      const raw = window.localStorage.getItem(LS_KEY)
      if (!raw) return defaultLayout()
      const parsed = JSON.parse(raw) as DockNode
      if (expectedPanelIds.length > 0
          && !isValidLayout(parsed, new Set(expectedPanelIds))) {
        return defaultLayout()
      }
      if (parsed && typeof parsed === 'object' && 'kind' in parsed) return parsed
    } catch { /* fall through */ }
    return defaultLayout()
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LS_KEY, JSON.stringify(layout))
  }, [layout])

  const dispatchDrop = useCallback((panelId: string, targetLeafId: string, edge: DockEdge) => {
    if (targetLeafId === ROOT_LEAF_ID) {
      if (edge === 'center') return  // root drop has no "center" meaning
      setLayout((tree) => dropPanelToRoot(tree, panelId, edge))
      return
    }
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

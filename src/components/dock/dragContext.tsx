'use client'
import {
  createContext, useContext, useState, useRef, useCallback, useEffect,
  type ReactNode,
} from 'react'
import type { DockEdge } from './types'

interface DragInfo {
  panelId: string
  sourceLeafId: string
  /** Live pointer position (clientX/Y), updated on every pointermove. */
  pointerX: number
  pointerY: number
}

interface DragContextValue {
  drag: DragInfo | null
  beginDrag: (panelId: string, sourceLeafId: string, e: React.PointerEvent) => void
  /** Hovered target while dragging, or null. Leaves register themselves here. */
  hoverTarget: { leafId: string; edge: DockEdge } | null
  setHoverTarget: (t: { leafId: string; edge: DockEdge } | null) => void
  /** Called by leaves on pointerup when drop should commit. */
  onDrop: (cb: (panelId: string, targetLeafId: string, edge: DockEdge) => void) => void
}

const DockDragContext = createContext<DragContextValue | null>(null)

export function useDockDrag(): DragContextValue {
  const ctx = useContext(DockDragContext)
  if (!ctx) throw new Error('useDockDrag must be used inside <DockDragProvider>')
  return ctx
}

interface ProviderProps {
  children: ReactNode
  onDrop: (panelId: string, targetLeafId: string, edge: DockEdge) => void
}

/**
 * Holds the panel-drag state at the editor root so any leaf can register
 * itself as a hover target. Pointermove + pointerup are attached to the
 * window during a drag — the drag is "live" without needing HTML5 DnD.
 */
export function DockDragProvider({ children, onDrop }: ProviderProps) {
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [hoverTarget, setHoverTarget] = useState<{ leafId: string; edge: DockEdge } | null>(null)
  const onDropRef = useRef(onDrop)
  useEffect(() => { onDropRef.current = onDrop }, [onDrop])

  // Update drag.pointerX/Y as cursor moves while dragging
  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      setDrag((d) => d ? { ...d, pointerX: e.clientX, pointerY: e.clientY } : d)
    }
    const onUp = () => {
      // Commit drop if a hover target was set, otherwise discard
      setDrag((d) => {
        if (!d) return null
        // Read latest hover target via closure — captured in onMove of overlays
        // For simplicity we read from React state via the parent's setter
        return null
      })
      // hoverTarget access via closure won't be fresh — use ref pattern below
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [drag])

  // Pointer-up commit: keep hoverTarget in ref so onUp reads latest value
  const hoverTargetRef = useRef(hoverTarget)
  useEffect(() => { hoverTargetRef.current = hoverTarget }, [hoverTarget])

  useEffect(() => {
    if (!drag) return
    const onUp = () => {
      const t = hoverTargetRef.current
      const d = drag
      if (t && d && (t.leafId !== d.sourceLeafId || t.edge !== 'center')) {
        onDropRef.current(d.panelId, t.leafId, t.edge)
      }
      setDrag(null)
      setHoverTarget(null)
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [drag])

  // Escape cancels drag
  useEffect(() => {
    if (!drag) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrag(null); setHoverTarget(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drag])

  const beginDrag = useCallback((panelId: string, sourceLeafId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    setDrag({ panelId, sourceLeafId, pointerX: e.clientX, pointerY: e.clientY })
  }, [])

  const onDropCb = useCallback((cb: (panelId: string, targetLeafId: string, edge: DockEdge) => void) => {
    onDropRef.current = cb
  }, [])

  return (
    <DockDragContext.Provider value={{
      drag, beginDrag, hoverTarget, setHoverTarget, onDrop: onDropCb,
    }}>
      {children}
      {drag && (
        <div
          className="fixed pointer-events-none z-[100] text-xs font-medium text-white
                     bg-blue-600/90 px-2 py-1 rounded shadow-lg"
          style={{
            left: drag.pointerX + 12,
            top:  drag.pointerY + 12,
          }}
        >
          ⤓ Dragging panel
        </div>
      )}
    </DockDragContext.Provider>
  )
}

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

/** Click-vs-drag threshold (px) — pointer must move at least this far before
 *  the operation counts as a real drag. Below this the click handler wins. */
const DRAG_THRESHOLD_PX = 4

/**
 * Holds the active drag at the editor root + commits drops on pointerup.
 *
 * Single useEffect owns BOTH pointermove (updating cursor pos in state) and
 * pointerup (reading the latest hoverTarget from a ref and dispatching the
 * drop). This avoids the listener-order race two separate effects had.
 *
 * `beginDrag` defers calling `setDrag` until the pointer has actually moved
 * past DRAG_THRESHOLD_PX — so a plain click on a tab is still a click.
 */
export function DockDragProvider({ children, onDrop }: ProviderProps) {
  const [drag, setDrag] = useState<DragInfo | null>(null)
  const [hoverTarget, setHoverTarget] = useState<{ leafId: string; edge: DockEdge } | null>(null)

  // Keep latest hoverTarget + onDrop in refs so the pointerup closure can
  // read up-to-date values without re-registering listeners each render.
  const hoverTargetRef = useRef(hoverTarget)
  useEffect(() => { hoverTargetRef.current = hoverTarget }, [hoverTarget])

  const onDropRef = useRef(onDrop)
  useEffect(() => { onDropRef.current = onDrop }, [onDrop])

  // ── While drag is active: pointermove + pointerup + Escape ───────────────
  useEffect(() => {
    if (!drag) return
    const dragSnapshot = drag  // capture for closure

    const onMove = (e: PointerEvent) => {
      setDrag((d) => d ? { ...d, pointerX: e.clientX, pointerY: e.clientY } : d)
    }

    const onUp = () => {
      const t = hoverTargetRef.current
      // Commit drop iff target is meaningful AND target is not the source leaf
      // (any edge on source leaf is a no-op — nowhere new to go).
      if (t && t.leafId !== dragSnapshot.sourceLeafId) {
        onDropRef.current(dragSnapshot.panelId, t.leafId, t.edge)
      }
      setDrag(null)
      setHoverTarget(null)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDrag(null); setHoverTarget(null) }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    window.addEventListener('keydown',     onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
      window.removeEventListener('keydown',     onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.panelId, drag?.sourceLeafId])

  // ── beginDrag with click-vs-drag threshold ───────────────────────────────
  const pendingDragRef = useRef<{
    panelId: string; sourceLeafId: string
    startX: number; startY: number
    onMove: (e: PointerEvent) => void
    onUp:   () => void
  } | null>(null)

  const beginDrag = useCallback((panelId: string, sourceLeafId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return

    const startX = e.clientX, startY = e.clientY

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      // Threshold passed — promote to real drag
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
      pendingDragRef.current = null
      setDrag({ panelId, sourceLeafId, pointerX: ev.clientX, pointerY: ev.clientY })
    }
    const onUp = () => {
      // Released before threshold → treat as click (do nothing here; tab's
      // onClick handler runs naturally)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup',   onUp)
      pendingDragRef.current = null
    }

    pendingDragRef.current = { panelId, sourceLeafId, startX, startY, onMove, onUp }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
  }, [])

  return (
    <DockDragContext.Provider value={{ drag, beginDrag, hoverTarget, setHoverTarget }}>
      {children}
      {drag && (
        <div
          className="fixed pointer-events-none z-[100] text-xs font-medium text-white
                     bg-blue-600/90 px-2 py-1 rounded shadow-lg"
          style={{ left: drag.pointerX + 12, top: drag.pointerY + 12 }}
        >
          ⤓ Moving panel
        </div>
      )}
    </DockDragContext.Provider>
  )
}

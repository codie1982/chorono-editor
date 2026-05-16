'use client'
import { useEffect, type RefObject } from 'react'
import { useDockDrag } from './dragContext'
import type { DockEdge } from './types'

const EDGE_THICK_PX = 32       // outer-zone thickness (cursor must be this close to an edge)
export const ROOT_LEAF_ID = '__ROOT__'  // pseudo leaf id signalling "drop onto root, not a leaf"

interface Props {
  /** Ref to the dock container — used to read its viewport rect. */
  containerRef: RefObject<HTMLDivElement | null>
}

/**
 * Invisible perimeter drop detector that runs alongside the leaf hover
 * tracking. When the cursor enters the outer 32px of the dock area during
 * a drag, this sets hoverTarget to `__ROOT__` with the matching edge, and
 * the drop is dispatched against the root instead of a specific leaf —
 * letting users place a panel as a full-width/height side or strip.
 *
 * Renders the corresponding preview rectangle (30% of dock on that side)
 * so the drop is WYSIWYG.
 */
export default function DockOuterEdges({ containerRef }: Props) {
  const { drag, hoverTarget, setHoverTarget } = useDockDrag()

  useEffect(() => {
    if (!drag) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const { pointerX, pointerY } = drag

    const inside =
      pointerX >= rect.left  && pointerX <= rect.right &&
      pointerY >= rect.top   && pointerY <= rect.bottom

    if (!inside) {
      // Pointer left the dock entirely — clear if we were the active target
      if (hoverTarget?.leafId === ROOT_LEAF_ID) setHoverTarget(null)
      return
    }

    let outerEdge: DockEdge | null = null
    if      (pointerX < rect.left  + EDGE_THICK_PX) outerEdge = 'left'
    else if (pointerX > rect.right - EDGE_THICK_PX) outerEdge = 'right'
    else if (pointerY < rect.top   + EDGE_THICK_PX) outerEdge = 'top'
    else if (pointerY > rect.bottom - EDGE_THICK_PX) outerEdge = 'bottom'

    if (outerEdge) {
      // Outer zone wins over whatever leaf the pointer is also inside
      setHoverTarget({ leafId: ROOT_LEAF_ID, edge: outerEdge })
    } else if (hoverTarget?.leafId === ROOT_LEAF_ID) {
      // Moved off the outer zone (back into the interior) — release so the
      // leaf hover detector can claim the cursor again on its next tick.
      setHoverTarget(null)
    }
  }, [drag, containerRef, hoverTarget?.leafId, setHoverTarget])

  if (!drag || hoverTarget?.leafId !== ROOT_LEAF_ID || hoverTarget.edge === 'center') return null

  const edge = hoverTarget.edge
  const style: React.CSSProperties =
    edge === 'left'   ? { left: 0,   top: 0,    bottom: 0, width:  '30%' } :
    edge === 'right'  ? { right: 0,  top: 0,    bottom: 0, width:  '30%' } :
    edge === 'top'    ? { left: 0,   right: 0,  top: 0,    height: '30%' } :
                        { left: 0,   right: 0,  bottom: 0, height: '30%' }

  return (
    <div className="absolute inset-0 pointer-events-none z-[60] dock-overlay-in">
      <div
        className="absolute bg-blue-500/40 border-2 border-blue-400 shadow-2xl shadow-blue-500/30 transition-all duration-150"
        style={style}
      />
      <div
        className="absolute text-[10px] font-mono text-blue-100 bg-blue-900/90 px-2 py-1 rounded pointer-events-none"
        style={
          edge === 'left'   ? { left: 8,        top: '50%',  transform: 'translateY(-50%)' } :
          edge === 'right'  ? { right: 8,       top: '50%',  transform: 'translateY(-50%)' } :
          edge === 'top'    ? { left: '50%',    top: 8,      transform: 'translateX(-50%)' } :
                              { left: '50%',    bottom: 8,   transform: 'translateX(-50%)' }
        }
      >
        ⤓ Dock to {edge} (full {edge === 'left' || edge === 'right' ? 'height' : 'width'})
      </div>
    </div>
  )
}

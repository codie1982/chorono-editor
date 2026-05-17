'use client'
import { useRef, useState, useEffect } from 'react'
import type { DockLeaf, DockEdge } from './types'
import type { PanelRegistry } from './registry'
import { useDockDrag } from './dragContext'

interface Props {
  leaf: DockLeaf
  registry: PanelRegistry
  onTabSelect: (panelId: string) => void
  onToggleCollapse?: (next: boolean) => void
  /** Which side is the splitter on, so the collapse chevron points toward
   *  the panel content. 'h-right' = panel is to the LEFT of a vertical
   *  splitter; chevron points right when collapsed (expand to the right). */
  collapseSide?: 'h-right' | 'h-left' | 'v-bottom' | 'v-top'
}

const EDGE_THRESHOLD = 0.25  // outer 25% of each side → edge drop zone

/**
 * Renders one leaf of the dock tree: a tab strip + active panel body + drop
 * overlay (visible only while a drag is in progress).
 */
export default function DockLeafComponent({
  leaf, registry, onTabSelect, onToggleCollapse, collapseSide,
}: Props) {
  // NOTE on hook ordering — every hook below MUST be called on every
  // render, even when the leaf is collapsed. The early-return for the
  // collapsed rail therefore happens AFTER all hooks; otherwise React
  // throws "Rendered fewer hooks than expected" when toggling collapse.
  const { drag, beginDrag, hoverTarget, setHoverTarget } = useDockDrag()
  const containerRef = useRef<HTMLDivElement>(null)
  const [localEdge, setLocalEdge] = useState<DockEdge | null>(null)

  // Compute hovered edge based on pointer position while dragging.
  // Source leaf is excluded — you can't drop a panel back onto its own leaf.
  // Collapsed leaves also opt out (no useful drop target inside a 24px rail).
  const isSource = drag?.sourceLeafId === leaf.id
  useEffect(() => {
    if (!drag || isSource || leaf.collapsed) { setLocalEdge(null); return }
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = drag.pointerX, y = drag.pointerY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      if (hoverTarget?.leafId === leaf.id) setHoverTarget(null)
      setLocalEdge(null)
      return
    }
    const fx = (x - rect.left) / rect.width
    const fy = (y - rect.top)  / rect.height
    let edge: DockEdge = 'center'
    if      (fx < EDGE_THRESHOLD)        edge = 'left'
    else if (fx > 1 - EDGE_THRESHOLD)    edge = 'right'
    else if (fy < EDGE_THRESHOLD)        edge = 'top'
    else if (fy > 1 - EDGE_THRESHOLD)    edge = 'bottom'
    setLocalEdge(edge)
    setHoverTarget({ leafId: leaf.id, edge })
  }, [drag, isSource, leaf.collapsed, leaf.id, hoverTarget?.leafId, setHoverTarget])

  const activePanelId = leaf.panels[leaf.activeIndex]
  const activeDef = activePanelId ? registry.get(activePanelId) : null
  const dropZoneStyle = getEdgeOverlayStyle(localEdge)

  // ── Collapsed rail — thin strip with just an expand arrow ────────────────
  //    Rendered AFTER all hooks above so React's hook count stays constant
  //    across the collapsed ↔ expanded transition.
  if (leaf.collapsed) {
    const chevron =
      collapseSide === 'h-right' ? '〉' :
      collapseSide === 'h-left'  ? '〈' :
      collapseSide === 'v-bottom'? '∨' :
                                   '∧'
    return (
      <div
        key={leaf.id}
        className="relative flex flex-col items-center justify-start
                   bg-gray-900 border border-gray-800 dock-leaf-in"
        style={{
          width:  (collapseSide?.startsWith('h')) ? '24px'  : '100%',
          height: (collapseSide?.startsWith('v')) ? '24px'  : '100%',
        }}
      >
        <button
          onClick={() => onToggleCollapse?.(false)}
          title={`Expand · ${leaf.panels.map(p => registry.get(p)?.title ?? p).join(' / ')}`}
          className="w-6 h-6 mt-1 flex items-center justify-center text-gray-400
                     hover:text-white hover:bg-gray-800 rounded text-xs"
        >
          {chevron}
        </button>
        {(collapseSide?.startsWith('h')) && (
          <div className="mt-2 text-[9px] uppercase tracking-wider text-gray-500
                          [writing-mode:vertical-rl] rotate-180 select-none">
            {leaf.panels.map(p => registry.get(p)?.title ?? p).join(' · ')}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      key={leaf.id}
      className="relative flex flex-col h-full bg-gray-900 border border-gray-800 overflow-hidden dock-leaf-in"
    >
      {/* Tab strip — also the drag handle */}
      <div className="flex items-center bg-gray-800/80 border-b border-gray-700 shrink-0 h-7">
        {leaf.panels.map((pid) => {
          const def = registry.get(pid)
          if (!def) return null
          const isActive = pid === activePanelId
          return (
            <div
              key={pid}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                // Always select on press; if the pointer crosses the drag
                // threshold afterwards, dragContext promotes it to a real drag.
                onTabSelect(pid)
                beginDrag(pid, leaf.id, e)
              }}
              className={`relative px-3 h-full flex items-center text-xs cursor-grab active:cursor-grabbing
                border-r border-gray-700/60 select-none
                ${isActive
                  ? 'bg-gray-900 text-gray-100 border-t-2 border-t-blue-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
              title="Drag to rearrange — drop on another panel's edge"
            >
              {def.title}
            </div>
          )
        })}
        <div className="flex-1" />
        {onToggleCollapse && (
          <button
            onClick={() => onToggleCollapse(true)}
            title="Collapse panel"
            className="w-6 h-full flex items-center justify-center text-gray-500
                       hover:text-white hover:bg-gray-700 text-[10px] shrink-0"
          >
            {collapseSide === 'h-right' ? '〈' :
             collapseSide === 'h-left'  ? '〉' :
             collapseSide === 'v-bottom'? '∧' : '∨'}
          </button>
        )}
      </div>

      {/* Panel body — flex container so children using flex-1 / h-full
          / w-full all fill the available area regardless of style choice. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeDef
          ? activeDef.render()
          : <div className="p-6 text-xs text-gray-600 text-center">Empty panel</div>}
      </div>

      {/* Drop overlay (visible during drag) */}
      {drag && localEdge && (
        <div className="absolute inset-0 pointer-events-none z-40 dock-overlay-in">
          {localEdge === 'center' ? (
            <div className="absolute inset-2 border-2 border-blue-400/80 bg-blue-500/10 rounded
                            flex items-center justify-center transition-all duration-150">
              <span className="text-xs font-medium text-blue-200 bg-blue-900/80 px-3 py-1 rounded shadow">
                + Add tab
              </span>
            </div>
          ) : (
            <div
              className="absolute bg-blue-500/40 border-2 border-blue-400 transition-all duration-150"
              style={dropZoneStyle}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Build the half-pane preview rectangle for an edge ────────────────────────
function getEdgeOverlayStyle(edge: DockEdge | null): React.CSSProperties {
  switch (edge) {
    case 'left':   return { left: 0, top: 0, bottom: 0, width: '50%' }
    case 'right':  return { right: 0, top: 0, bottom: 0, width: '50%' }
    case 'top':    return { left: 0, right: 0, top: 0, height: '50%' }
    case 'bottom': return { left: 0, right: 0, bottom: 0, height: '50%' }
    default:       return { display: 'none' }
  }
}

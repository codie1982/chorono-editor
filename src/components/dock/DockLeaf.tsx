'use client'
import { useRef, useState, useEffect } from 'react'
import type { DockLeaf, DockEdge, DockTheme } from './types'
import type { PanelRegistry } from './registry'
import { useDockDrag } from './dragContext'
import ContextMenu, { useContextMenu } from '@/components/ui/ContextMenu'

interface Props {
  leaf: DockLeaf
  registry: PanelRegistry
  onTabSelect: (panelId: string) => void
  onClosePanel?: (panelId: string) => void
  onToggleCollapse?: (next: boolean) => void
  /** Which side is the splitter on, so the collapse chevron points toward
   *  the panel content. 'h-right' = panel is to the LEFT of a vertical
   *  splitter; chevron points right when collapsed (expand to the right). */
  collapseSide?: 'h-right' | 'h-left' | 'v-bottom' | 'v-top'
  theme?: DockTheme
}

const EDGE_THRESHOLD = 0.25  // outer 25% of each side → edge drop zone

/**
 * Renders one leaf of the dock tree: a tab strip + active panel body + drop
 * overlay (visible only while a drag is in progress).
 * The tab picker reads this leaf's live panel IDs on every render, so docking,
 * closing and merging panels update its scope without a separate stored list.
 */
export default function DockLeafComponent({
  leaf, registry, onTabSelect, onClosePanel, onToggleCollapse, collapseSide, theme = 'default',
}: Props) {
  // NOTE on hook ordering — every hook below MUST be called on every
  // render, even when the leaf is collapsed. The early-return for the
  // collapsed rail therefore happens AFTER all hooks; otherwise React
  // throws "Rendered fewer hooks than expected" when toggling collapse.
  const { drag, beginDrag, hoverTarget, setHoverTarget } = useDockDrag()
  const containerRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const [localEdge, setLocalEdge] = useState<DockEdge | null>(null)
  const tabMenu = useContextMenu()

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

  // Keep the active tab reachable after selecting a panel from a menu or a
  // keyboard shortcut, even when the tab strip is narrower than its contents.
  useEffect(() => {
    const tab = tabsRef.current?.querySelector<HTMLElement>(`[data-dock-tab="${activePanelId}"]`)
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activePanelId, leaf.panels, leaf.collapsed])

  // ── Collapsed rail — thin strip with just an expand arrow ────────────────
  //    Rendered AFTER all hooks above so React's hook count stays constant
  //    across the collapsed ↔ expanded transition.
  if (leaf.collapsed) {
    const chevron =
      collapseSide === 'h-right' ? '〉' :
      collapseSide === 'h-left'  ? '〈' :
      collapseSide === 'v-bottom'? '∨' :
                                   '∧'
    // Pick the mount-in animation that "comes from" the direction the panel
    // just retreated to: left panel rail flies in from the LEFT edge,
    // right panel rail from the RIGHT edge, etc. Makes the collapse direction
    // visually obvious instead of a generic fade.
    const railAnim =
      collapseSide === 'h-right' ? 'dock-rail-from-left'   :  // left panel → enters from left
      collapseSide === 'h-left'  ? 'dock-rail-from-right'  :  // right panel → enters from right
      collapseSide === 'v-bottom'? 'dock-rail-from-top'    :
                                   'dock-rail-from-bottom'
    return (
      <div
        key={leaf.id}
        className={`relative flex flex-col items-center justify-start border ${theme === 'model3d' ? 'bg-[#0b1220] border-[#263244]' : 'bg-gray-900 border-gray-800'} ${railAnim}`}
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
      data-panel={activePanelId}
      className={`relative flex flex-col h-full overflow-hidden dock-leaf-in border ${theme === 'model3d' ? 'bg-[#0b1220] border-[#263244]' : 'bg-gray-900 border-gray-800'}`}
    >
      {/* Tab strip — also the drag handle. Collapse button sits on the
          INNER edge (the side touching the work area) so the affordance
          mirrors which way the panel collapses:
            · left panel  → button on the right of the strip → 〈 collapse left
            · right panel → button on the LEFT of the strip  → 〉 collapse right
            · top panel   → button on the bottom row (always-right is fine)
            · bottom panel→ button on the right (top edge — fine)
          Only horizontal splits get the mirrored placement; vertical splits
          keep the conventional far-right position. */}
      <div role="tablist" className={`flex min-w-0 items-center overflow-x-auto border-b shrink-0 h-7 [&::-webkit-scrollbar]:h-1 ${theme === 'model3d' ? 'bg-[#141e2e] border-[#263244]' : 'bg-gray-800/80 border-gray-700'}`}>
        {collapseSide === 'h-left' && onToggleCollapse && (
          <button
            onClick={() => onToggleCollapse(true)}
            title="Collapse panel to the right"
            className="w-6 h-full flex items-center justify-center text-gray-500
                       hover:text-white hover:bg-gray-700 text-[10px] shrink-0
                       border-r border-gray-700/60"
          >〉</button>
        )}
        <div ref={tabsRef} role="tablist" aria-label="Panel tabs"
          className="flex h-full min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden scrollbar-none">
          {leaf.panels.map((pid) => {
            const def = registry.get(pid)
            if (!def) return null
            const isActive = pid === activePanelId
            return (
              <div
                key={pid}
                data-dock-tab={pid}
                role="tab" tabIndex={0} aria-label={def.title}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onTabSelect(pid) } }}
                aria-selected={isActive}
                data-panel={pid}
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  // Ignore close button clicks
                  if ((e.target as HTMLElement).closest('[data-close-btn]')) return
                  // Always select on press; if the pointer crosses the drag
                  // threshold afterwards, dragContext promotes it to a real drag.
                  onTabSelect(pid)
                  beginDrag(pid, leaf.id, e)
                }}
                className={`relative shrink-0 px-2 h-full flex items-center gap-1 text-xs cursor-grab active:cursor-grabbing
                  border-r border-gray-700/60 select-none whitespace-nowrap group
                  ${isActive
                    ? `text-gray-100 border-t-2 ${theme === 'model3d' ? 'bg-[#0b1220] border-t-cyan-500' : 'bg-gray-900 border-t-blue-500'}`
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                title="Drag to rearrange — drop on another panel's edge"
              >
                {def.title}
                {onClosePanel && def.closable !== false && (
                  <button
                    data-close-btn
                    onClick={(e) => {
                      e.stopPropagation()
                      onClosePanel(pid)
                    }}
                    className="ml-0.5 w-4 h-4 shrink-0 flex items-center justify-center rounded
                               text-gray-500 hover:text-gray-200 hover:bg-gray-700
                               opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Close panel"
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
        <button type="button" aria-label="List panel tabs" title="List panel tabs"
          aria-haspopup="menu" aria-expanded={tabMenu.isOpen}
          className="flex h-full w-7 shrink-0 items-center justify-center border-l border-gray-700/60 text-gray-300 hover:bg-gray-700 hover:text-white"
          onClick={event => {
            if (tabMenu.isOpen) { tabMenu.close(); return }
            const rect = event.currentTarget.getBoundingClientRect()
            tabMenu.open({ clientX: rect.right - 220, clientY: rect.bottom + 2 })
          }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M2 4h12M2 8h8M2 12h8m2-3 2 2 2-2" />
          </svg>
        </button>
        {collapseSide !== 'h-left' && onToggleCollapse && (
          <button
            onClick={() => onToggleCollapse(true)}
            title="Collapse panel"
            className="w-6 h-full flex items-center justify-center text-gray-500
                       hover:text-white hover:bg-gray-700 text-[10px] shrink-0"
          >
            {collapseSide === 'h-right' ? '〈' :
             collapseSide === 'v-bottom'? '∧' : '∨'}
          </button>
        )}
      </div>

      {tabMenu.state && <ContextMenu x={tabMenu.state.x} y={tabMenu.state.y} onClose={tabMenu.close}
        items={leaf.panels.flatMap(pid => {
          const def = registry.get(pid)
          return def ? [{ kind: 'action' as const, label: def.title,
            icon: pid === activePanelId ? '✓' : undefined, onSelect: () => onTabSelect(pid) }] : []
        })} />}

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
            <div className={`absolute inset-2 border-2 rounded flex items-center justify-center transition-all duration-150 ${theme === 'model3d' ? 'border-cyan-500/80 bg-cyan-900/20' : 'border-blue-400/80 bg-blue-500/10'}`}>
              <span className={`text-xs font-medium px-3 py-1 rounded shadow ${theme === 'model3d' ? 'text-cyan-100 bg-[#164e63]' : 'text-blue-200 bg-blue-900/80'}`}>
                + Add tab
              </span>
            </div>
          ) : (
            <div
              className={`absolute border-2 transition-all duration-150 ${theme === 'model3d' ? 'bg-cyan-700/40 border-cyan-500' : 'bg-blue-500/40 border-blue-400'}`}
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

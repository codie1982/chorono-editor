'use client'
import { useRef, useCallback, useState } from 'react'
import type { DockNode, DockSplit } from './types'
import type { PanelRegistry } from './registry'
import DockLeafComponent from './DockLeaf'

interface Props {
  node: DockNode
  registry: PanelRegistry
  onTabSelect: (leafId: string, panelId: string) => void
  onClosePanel?: (panelId: string) => void
  onResize:    (splitId: string, ratio: number) => void
  onCollapse?: (leafId: string, collapsed: boolean) => void
  /** Forwarded by parent split so leaves know which side they're on. */
  collapseSide?: 'h-right' | 'h-left' | 'v-bottom' | 'v-top'
}

/**
 * Recursive renderer for the dock tree.
 *  - Split nodes → two children + a splitter handle between them
 *  - Leaf nodes  → DockLeafComponent (tabs + body + drop overlay)
 */
export default function DockLayout({
  node, registry, onTabSelect, onClosePanel, onResize, onCollapse, collapseSide,
}: Props) {
  if (node.kind === 'leaf') {
    return (
      <DockLeafComponent
        leaf={node}
        registry={registry}
        onTabSelect={(panelId) => onTabSelect(node.id, panelId)}
        onClosePanel={onClosePanel}
        onToggleCollapse={onCollapse
          ? (next) => onCollapse(node.id, next)
          : undefined}
        collapseSide={collapseSide}
      />
    )
  }
  return (
    <DockSplitComponent
      split={node}
      registry={registry}
      onTabSelect={onTabSelect}
      onClosePanel={onClosePanel}
      onResize={onResize}
      onCollapse={onCollapse}
    />
  )
}

interface SplitProps {
  split: DockSplit
  registry: PanelRegistry
  onTabSelect: (leafId: string, panelId: string) => void
  onClosePanel?: (panelId: string) => void
  onResize:    (splitId: string, ratio: number) => void
  onCollapse?: (leafId: string, collapsed: boolean) => void
}

const COLLAPSED_PX = 24

function DockSplitComponent({ split, registry, onTabSelect, onClosePanel, onResize, onCollapse }: SplitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  /** Suspends the size CSS transition while the user is actively dragging
   *  the splitter so the panel tracks the cursor with zero lag. */
  const [isDragging, setIsDragging] = useState(false)

  const beginSplitterDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    setIsDragging(true)

    const move = (ev: PointerEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const offset = split.direction === 'h'
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top)  / rect.height
      onResize(split.id, offset)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try { target.releasePointerCapture(e.pointerId) } catch { /* */ }
      setIsDragging(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [split.id, split.direction, onResize])

  const isH = split.direction === 'h'
  const ratioPct = (split.ratio * 100).toFixed(2)
  const sizeTransition = isDragging
    ? 'none'
    : (isH ? 'width 200ms ease' : 'height 200ms ease')

  const [a, b] = split.children
  const aIsCollapsedLeaf = a.kind === 'leaf' && a.collapsed === true
  const bIsCollapsedLeaf = b.kind === 'leaf' && b.collapsed === true

  // Splitter is hidden when either side is collapsed — no useful resize then.
  const showSplitter = !aIsCollapsedLeaf && !bIsCollapsedLeaf

  // Side hints passed down so leaves know which direction the chevron points.
  // 'h-right' = leaf is on the LEFT of a horizontal split → expand-right.
  const aSide: 'h-right' | 'v-bottom' = isH ? 'h-right'  : 'v-bottom'
  const bSide: 'h-left'  | 'v-top'    = isH ? 'h-left'   : 'v-top'

  // First-child sizing:
  //   collapsed → fixed COLLAPSED_PX, sibling flexes to fill
  //   normal    → ratio % of the parent
  const firstStyle: React.CSSProperties = aIsCollapsedLeaf
    ? (isH ? { width: COLLAPSED_PX } : { height: COLLAPSED_PX })
    : (isH ? { width: `${ratioPct}%` } : { height: `${ratioPct}%` })

  // When the SECOND child is collapsed: first takes flex:1, second is fixed.
  // We special-case that by giving first child flex:1 and overriding style.
  const firstFlex1: React.CSSProperties = bIsCollapsedLeaf
    ? { flex: 1 }
    : { transition: sizeTransition, ...firstStyle }

  return (
    <div
      ref={containerRef}
      className={`flex ${isH ? 'flex-row' : 'flex-col'} w-full h-full min-h-0 min-w-0`}
    >
      <div className="min-w-0 min-h-0 overflow-hidden" style={firstFlex1}>
        <DockLayout
          node={a}
          registry={registry}
          onTabSelect={onTabSelect}
          onClosePanel={onClosePanel}
          onResize={onResize}
          onCollapse={onCollapse}
          collapseSide={aSide}
        />
      </div>

      {showSplitter && (
        <div
          onPointerDown={beginSplitterDrag}
          className={`shrink-0 z-20 transition-colors duration-150
            ${isH
              ? 'w-1 cursor-col-resize hover:bg-blue-500/60'
              : 'h-1 cursor-row-resize hover:bg-blue-500/60'}
            ${isDragging ? 'bg-blue-500/80' : 'bg-gray-800'}`}
        />
      )}

      <div
        className="min-w-0 min-h-0 overflow-hidden"
        style={bIsCollapsedLeaf
          ? (isH ? { width: COLLAPSED_PX } : { height: COLLAPSED_PX })
          : { flex: 1 }}
      >
        <DockLayout
          node={b}
          registry={registry}
          onTabSelect={onTabSelect}
          onClosePanel={onClosePanel}
          onResize={onResize}
          onCollapse={onCollapse}
          collapseSide={bSide}
        />
      </div>
    </div>
  )
}

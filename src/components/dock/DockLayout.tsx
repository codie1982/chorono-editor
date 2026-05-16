'use client'
import { useRef, useCallback, useState } from 'react'
import type { DockNode, DockSplit } from './types'
import type { PanelRegistry } from './registry'
import DockLeafComponent from './DockLeaf'

interface Props {
  node: DockNode
  registry: PanelRegistry
  onTabSelect: (leafId: string, panelId: string) => void
  onResize:    (splitId: string, ratio: number) => void
}

/**
 * Recursive renderer for the dock tree.
 *  - Split nodes → two children + a splitter handle between them
 *  - Leaf nodes  → DockLeafComponent (tabs + body + drop overlay)
 *
 * Splits use flex layout with explicit `flex-basis: ratio%` on the first child
 * and `flex: 1` on the second, so resizing only mutates one value.
 */
export default function DockLayout({ node, registry, onTabSelect, onResize }: Props) {
  if (node.kind === 'leaf') {
    return (
      <DockLeafComponent
        leaf={node}
        registry={registry}
        onTabSelect={(panelId) => onTabSelect(node.id, panelId)}
      />
    )
  }
  return (
    <DockSplitComponent
      split={node}
      registry={registry}
      onTabSelect={onTabSelect}
      onResize={onResize}
    />
  )
}

interface SplitProps {
  split: DockSplit
  registry: PanelRegistry
  onTabSelect: (leafId: string, panelId: string) => void
  onResize:    (splitId: string, ratio: number) => void
}

function DockSplitComponent({ split, registry, onTabSelect, onResize }: SplitProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  /** While the splitter is being dragged, suspend the size transition so
   *  the panel tracks the cursor exactly (no easing lag). */
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
  // Smooth ratio changes from drop-reflow; bypassed during splitter drag.
  const sizeTransition = isDragging
    ? 'none'
    : (isH ? 'width 200ms ease' : 'height 200ms ease')

  return (
    <div
      ref={containerRef}
      className={`flex ${isH ? 'flex-row' : 'flex-col'} w-full h-full min-h-0 min-w-0`}
    >
      <div
        className="min-w-0 min-h-0 overflow-hidden"
        style={{
          ...(isH ? { width: `${ratioPct}%` } : { height: `${ratioPct}%` }),
          transition: sizeTransition,
        }}
      >
        <DockLayout
          node={split.children[0]}
          registry={registry}
          onTabSelect={onTabSelect}
          onResize={onResize}
        />
      </div>

      <div
        onPointerDown={beginSplitterDrag}
        className={`shrink-0 z-20 transition-colors duration-150
          ${isH
            ? 'w-1 cursor-col-resize hover:bg-blue-500/60'
            : 'h-1 cursor-row-resize hover:bg-blue-500/60'}
          ${isDragging ? 'bg-blue-500/80' : 'bg-gray-800'}`}
      />

      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <DockLayout
          node={split.children[1]}
          registry={registry}
          onTabSelect={onTabSelect}
          onResize={onResize}
        />
      </div>
    </div>
  )
}

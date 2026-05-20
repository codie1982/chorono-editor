'use client'
import { useMemo } from 'react'
import type { ChronoScene, Timeline } from '@/lib/types'
import { buildHierarchy } from '@/lib/dope-sheet/hierarchy-builder'
import type { TrackNode } from './types'
import TrackNodeRow from './TrackNodeRow'

interface Props {
  scene: ChronoScene
  selectedTimeline: Timeline
  selectedLayerId: string | null
  collapsedNodeIds: Set<string>
  onToggleExpand: (nodeId: string) => void
  onSelectLayer: (id: string | null) => void
  filterAnimatedOnly: boolean
  filterSelectedObjectOnly: boolean
  filterText: string
}

export default function DopeSheetHierarchy({
  scene,
  selectedTimeline,
  selectedLayerId,
  collapsedNodeIds,
  onToggleExpand,
  onSelectLayer,
  filterAnimatedOnly,
  filterSelectedObjectOnly,
  filterText,
}: Props) {
  // Build hierarchy tree
  const nodes = useMemo(
    () =>
      buildHierarchy(
        scene,
        selectedTimeline,
        filterAnimatedOnly,
        filterSelectedObjectOnly,
        filterText,
        selectedLayerId,
      ),
    [scene, selectedTimeline, filterAnimatedOnly, filterSelectedObjectOnly, filterText, selectedLayerId],
  )

  // Fast lookup by id for child resolution
  const nodeById = useMemo(() => {
    const m = new Map<string, TrackNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  // Render tree (depth-first). Nodes are expanded by default; a node is
  // collapsed only if its id is present in collapsedNodeIds.
  const renderNode = (node: TrackNode): React.ReactNode => {
    const isExpanded = !collapsedNodeIds.has(node.id)

    return (
      <div key={node.id}>
        <TrackNodeRow
          node={node}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          onSelectLayer={onSelectLayer}
          selectedLayerId={selectedLayerId}
        />

        {/* Render children if expanded */}
        {isExpanded && node.children.length > 0 && (
          <div className="hierarchy-children">
            {node.children.map(childId => {
              const childNode = nodeById.get(childId)
              return childNode ? renderNode(childNode) : null
            })}
          </div>
        )}
      </div>
    )
  }

  // Render only from the root (depth 0); children render recursively.
  const root = nodes.find(n => n.depth === 0) ?? nodes[0]

  return (
    <div className="dope-sheet-hierarchy">
      <div className="hierarchy-tree">
        {root ? (
          renderNode(root)
        ) : (
          <div className="hierarchy-empty">No layers or tracks</div>
        )}
      </div>
    </div>
  )
}

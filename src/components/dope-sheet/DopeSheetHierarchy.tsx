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
  expandedNodeIds: Set<string>
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
  expandedNodeIds,
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

  // Render tree (depth-first, showing only expanded parents)
  const renderNode = (node: TrackNode): React.ReactNode => {
    const isExpanded = expandedNodeIds.has(node.id)

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
              const childNode = nodes.find(n => n.id === childId)
              return childNode ? renderNode(childNode) : null
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dope-sheet-hierarchy">
      <div className="hierarchy-tree">
        {nodes.length > 0 ? (
          nodes.map(node => renderNode(node))
        ) : (
          <div className="hierarchy-empty">No layers or tracks</div>
        )}
      </div>
    </div>
  )
}

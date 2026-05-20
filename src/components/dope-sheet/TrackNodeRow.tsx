'use client'
import type { TrackNode } from './types'

interface Props {
  node: TrackNode
  isExpanded: boolean
  onToggleExpand: (nodeId: string) => void
  onSelectLayer: (id: string | null) => void
  selectedLayerId: string | null
}

export default function TrackNodeRow({
  node,
  isExpanded,
  onToggleExpand,
  onSelectLayer,
  selectedLayerId,
}: Props) {
  const handleToggleExpand = () => {
    onToggleExpand(node.id)
  }

  const handleSelectLayer = () => {
    if (node.type === 'object' || node.type === 'group') {
      const layerId = node.trackTarget?.match(/layers\.([^.]+)/)?.[1] || null
      onSelectLayer(layerId)
    }
  }

  const isSelected =
    node.type === 'object' || (node.type === 'group' && node.trackTarget?.includes(selectedLayerId || ''))

  const paddingLeft = node.depth * 12

  // Icons
  const getIcon = () => {
    if (node.type === 'group' || node.isParent) {
      return isExpanded ? '▼' : '▶'
    }
    return null
  }

  const getTypeIcon = () => {
    if (node.type === 'property') return '●'
    if (node.type === 'group') return '📁'
    return '◻'
  }

  return (
    <div className={`track-node-row ${isSelected ? 'selected' : ''}`} style={{ paddingLeft }}>
      <div className="row-content">
        {/* Expand toggle */}
        {(node.isParent || node.children.length > 0) && (
          <button className="expand-toggle" onClick={handleToggleExpand}>
            {getIcon()}
          </button>
        )}

        {/* Type icon + name */}
        <span className="node-icon">{getTypeIcon()}</span>
        <span
          className={`node-name ${node.hasKeys ? 'has-keys' : ''}`}
          onClick={handleSelectLayer}
          title={node.trackTarget || node.name}
        >
          {node.name}
        </span>

        {/* Summary indicator (parent with keys) */}
        {node.isParent && node.hasKeys && <span className="summary-indicator">◆</span>}
      </div>
    </div>
  )
}
